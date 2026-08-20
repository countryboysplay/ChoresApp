import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { deviceLabelFrom } from '../auth/sessions.js';
import { pushConfig } from '../notifications/push.js';

/**
 * Subscribing a phone, and unsubscribing it.
 *
 * A subscription belongs to a browser rather than to a person. The endpoint is
 * minted by the phone's push service and is the same string whoever is signed
 * in, so it is the unique key and signing in as somebody else moves the row
 * across rather than adding a second one. On a shared tablet that is the
 * difference between the reminders following whoever is using it and the first
 * child's chores buzzing at the second child all evening.
 */

const SubscribeBody = z.object({
  // Push services hand out long URLs; the cap is a sanity bound, not a spec
  // limit. https only - a push endpoint is never anything else.
  endpoint: z.string().url().max(2048).startsWith('https://'),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

const UnsubscribeBody = z.object({
  endpoint: z.string().url().max(2048),
});

export async function pushRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;
  const requireAnyone = app.requireAuth();
  const requireParent = app.requireAuth(['parent']);

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  /**
   * The key the browser needs before it can subscribe.
   *
   * Served rather than baked into the bundle because the GitHub Pages preview
   * is built without a backend and would carry a key that matches nothing. A
   * VAPID public key is public by definition; it identifies the sender to the
   * push service and authorises nothing on its own.
   */
  app.get('/api/push/key', { onRequest: requireAnyone }, async () => {
    const config = pushConfig(env);
    return {
      configured: config !== null,
      publicKey: config?.publicKey ?? null,
    };
  });

  /**
   * Registers this browser, or moves an existing registration to whoever is
   * signed in now. Succeeds even when the server has no VAPID keys: the
   * browser's permission prompt has already been answered by then, and telling
   * someone "that did not work" after they said yes is worse than storing the
   * subscription and reporting honestly that nothing will arrive yet.
   */
  app.post('/api/push/subscribe', { onRequest: requireAnyone }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const parsed = SubscribeBody.safeParse(request.body);
    if (!parsed.success) throw app.httpErrors.badRequest('That is not a usable push subscription.');

    const { endpoint, keys } = parsed.data;

    await pool().query(
      `INSERT INTO push_subscriptions
         (user_id, session_id, endpoint, p256dh, auth, device_label)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE
          SET user_id      = EXCLUDED.user_id,
              session_id   = EXCLUDED.session_id,
              p256dh       = EXCLUDED.p256dh,
              auth         = EXCLUDED.auth,
              device_label = EXCLUDED.device_label,
              created_at   = now()`,
      [
        session.user.id,
        session.sessionId,
        endpoint,
        keys.p256dh,
        keys.auth,
        deviceLabelFrom(request.headers['user-agent']),
      ],
    );

    return { ok: true, configured: pushConfig(env) !== null };
  });

  /**
   * Turning reminders off on this phone. Scoped to the signed-in person, so a
   * guessed endpoint cannot silence somebody else's device.
   */
  app.delete('/api/push/subscribe', { onRequest: requireAnyone }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const parsed = UnsubscribeBody.safeParse(request.body);
    if (!parsed.success) throw app.httpErrors.badRequest('That is not a usable push subscription.');

    const { rowCount } = await pool().query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2',
      [parsed.data.endpoint, session.user.id],
    );

    // Not an error when there was nothing to remove. The browser may have
    // dropped the subscription itself, and the desired state is the same.
    return { ok: true, removed: rowCount ?? 0 };
  });

  /** What the System status screen reports. Counts, never endpoints. */
  app.get('/api/push/status', { onRequest: requireParent }, async () => {
    const { rows } = await pool().query<{ devices: number }>(
      'SELECT count(*)::int AS devices FROM push_subscriptions',
    );
    return {
      configured: pushConfig(env) !== null,
      devices: rows[0]?.devices ?? 0,
    };
  });

  /**
   * Which children's reminders are actually working, and which are not.
   *
   * This exists because the app cannot enforce what a parent would like it to.
   * Notification permission belongs to whoever is holding the phone: Chrome will
   * not let a site grant itself permission, and its settings can always take it
   * back. So the child app offers no way out of its own, and this endpoint makes
   * the browser's way out visible instead of silent. A child who switches
   * reminders off in Chrome shows up here as "no phone", which is a conversation
   * rather than a mystery.
   */
  app.get('/api/parent/push/children', { onRequest: requireParent }, async () => {
    const { rows } = await pool().query<{
      id: string;
      display_name: string;
      reminders_muted: boolean;
      devices: number;
    }>(
      `SELECT u.id, u.display_name, u.reminders_muted,
              (SELECT count(*)::int FROM push_subscriptions p WHERE p.user_id = u.id) AS devices
         FROM users u
        WHERE u.role = 'child' AND u.is_active
        ORDER BY u.sort_order, u.display_name`,
    );

    return {
      configured: pushConfig(env) !== null,
      children: rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        devices: row.devices,
        mutedByParent: row.reminders_muted,
        // The single question a parent is actually asking. Muted wins over
        // device count, because a silenced child with three phones is still
        // silenced and saying "on" would be a lie.
        remindersReaching: !row.reminders_muted && row.devices > 0,
      })),
    };
  });

  /**
   * The one deliberate off switch, on a screen no child can reach.
   *
   * For a child who is away, ill, or on a device that should not buzz. The
   * inbox still fills either way - muting stops the phone, not the record.
   */
  app.patch('/api/parent/push/children/:userId', { onRequest: requireParent }, async (request) => {
    const { userId } = request.params as { userId: string };
    if (!z.string().uuid().safeParse(userId).success) {
      throw app.httpErrors.notFound('No such person.');
    }

    const body = z.object({ muted: z.boolean() }).safeParse(request.body);
    if (!body.success) throw app.httpErrors.badRequest('Say whether reminders are muted.');

    const { rowCount } = await pool().query(
      `UPDATE users SET reminders_muted = $2 WHERE id = $1 AND role = 'child'`,
      [userId, body.data.muted],
    );
    if (!rowCount) throw app.httpErrors.notFound('No such child.');

    return { ok: true, muted: body.data.muted };
  });
}
