import webpush, { type PushSubscription, WebPushError } from 'web-push';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { Env } from '../env.js';
import type { NotificationKind } from './service.js';

/**
 * Getting a notification onto a phone that is not looking at the app.
 *
 * Two rules shape everything here.
 *
 * The first is that almost nothing is worth a buzz. A household interrupted for
 * every approval, every posted bonus, and every reward answer learns within a
 * week to swipe the whole app away, and then the one message that had to arrive
 * does not either. Only the child's evening reminder is pushed, because it is
 * the only notification whose entire purpose is to reach someone who is not
 * looking. Everything else is still written to the inbox and read when the app
 * is next opened, which is soon enough for news.
 *
 * The second is that this is at-most-once. A row is marked pushed before the
 * send is attempted, so a crash mid-send loses the buzz rather than repeating it
 * on restart. The inbox is the durable copy and always has the message; a phone
 * that buzzes four times for one chore is worse than one that buzzes none,
 * because the four-buzz version teaches the child to turn it off.
 */

/** The only kinds that reach a phone. Adding one here is the whole change. */
export const PUSHABLE_KINDS: readonly NotificationKind[] = ['chore_reminder'];

/**
 * How late a notification can be and still be worth sending. After a power cut,
 * a Windows update, or a fortnight with the laptop off, the drain finds every
 * unpushed row at once. Sending them would buzz a child's phone thirty times
 * about chores from days ago. Past this the row is marked done and left in the
 * inbox, where it reads as history rather than an alarm.
 */
const STALE_AFTER_MINUTES = 45;

/** One drain never sends more than this, however far behind it is. */
const BATCH_LIMIT = 100;

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Push is off until all three VAPID values are set, in the same way cash-out is
 * off until the rate and the minimum are. Nothing infers or invents them, and
 * every other part of the app works unchanged while they are missing.
 */
export function pushConfig(env: Env): PushConfig | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return null;
  return {
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
    subject: VAPID_SUBJECT,
  };
}

/** Applied once at startup rather than per send, so a bad key is loud early. */
export function applyPushConfig(config: PushConfig): void {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
}

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function toWebPush(row: StoredSubscription): PushSubscription {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
}

/** What the service worker receives. Kept small; phones cap the payload. */
export interface PushPayload {
  id: string;
  title: string;
  body: string;
  tone: string;
  deepLink: string | null;
}

export interface DrainResult {
  /** Individual phones that were sent to. */
  sent: number;
  /** Rows closed without sending: wrong kind, already read, or too old. */
  skipped: number;
  /** Subscriptions the push service said are gone, and were deleted. */
  pruned: number;
}

/**
 * Sends every notification that should buzz a phone and has not yet been tried.
 *
 * Like the reminder sweep this is a reconciliation - it asks what is still
 * unpushed rather than reacting to an event - which is why nothing that writes a
 * notification has to know push exists. A route that approves a chore inserts
 * its row and returns; the drain decides, a moment later, whether that row is
 * one of the few worth interrupting somebody for.
 */
export async function drainPushQueue(
  db: pg.Pool,
  env: Env,
  log: FastifyBaseLogger,
  now = new Date(),
): Promise<DrainResult> {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MINUTES * 60_000);

  // Close out everything that is not going anywhere, in one statement: the
  // kinds that never buzz, anything already read on another device, and
  // anything old enough that a buzz would be an alarm about yesterday.
  const { rowCount: closed } = await db.query(
    `UPDATE notifications
        SET pushed_at = $1
      WHERE pushed_at IS NULL
        AND (kind <> ALL($2::text[]) OR read_at IS NOT NULL OR created_at < $3)`,
    [now, PUSHABLE_KINDS, staleBefore],
  );

  if (!pushConfig(env)) {
    // Push is not set up. Leave the remaining rows unpushed rather than marking
    // them: the moment the keys are added, this evening's reminders are still
    // inside the stale window and go out.
    return { sent: 0, skipped: closed ?? 0, pruned: 0 };
  }

  // Claimed before sending. See the at-most-once note at the top of the file.
  const { rows: claimed } = await db.query<{
    id: string;
    user_id: string;
    title: string;
    body: string;
    tone: string;
    deep_link: string | null;
  }>(
    `UPDATE notifications
        SET pushed_at = $1
      WHERE id IN (
        SELECT id FROM notifications
         WHERE pushed_at IS NULL
         ORDER BY created_at
         LIMIT $2
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, user_id, title, body, tone, deep_link`,
    [now, BATCH_LIMIT],
  );

  let sent = 0;
  let pruned = 0;

  for (const row of claimed) {
    const { rows: subscriptions } = await db.query<StoredSubscription>(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [row.user_id],
    );
    if (subscriptions.length === 0) continue;

    const payload: PushPayload = {
      id: row.id,
      title: row.title,
      body: row.body,
      tone: row.tone,
      deepLink: row.deep_link,
    };

    for (const subscription of subscriptions) {
      const outcome = await sendOne(subscription, payload, log);
      if (outcome === 'sent') {
        sent += 1;
        await db.query('UPDATE push_subscriptions SET last_sent_at = $2 WHERE id = $1', [
          subscription.id,
          now,
        ]);
      } else if (outcome === 'gone') {
        pruned += 1;
        await db.query('DELETE FROM push_subscriptions WHERE id = $1', [subscription.id]);
      }
    }
  }

  return { sent, skipped: closed ?? 0, pruned };
}

type SendOutcome = 'sent' | 'gone' | 'failed';

/**
 * 404 and 410 are the push service saying this browser is gone for good -
 * uninstalled, cleared, or permission withdrawn - so the row is deleted. Every
 * other failure is treated as this-time-only and the subscription is kept: a
 * push service having a bad minute should not quietly unsubscribe a child.
 */
async function sendOne(
  subscription: StoredSubscription,
  payload: PushPayload,
  log: FastifyBaseLogger,
): Promise<SendOutcome> {
  try {
    await webpush.sendNotification(toWebPush(subscription), JSON.stringify(payload), {
      // A reminder is about tonight. If the phone has been off for four hours
      // the moment has passed, and the inbox already has it.
      TTL: 4 * 60 * 60,
      urgency: 'high',
    });
    return 'sent';
  } catch (error) {
    const status = error instanceof WebPushError ? error.statusCode : undefined;
    if (status === 404 || status === 410) return 'gone';
    log.warn({ err: error, status }, 'push send failed');
    return 'failed';
  }
}
