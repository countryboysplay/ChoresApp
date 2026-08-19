import type pg from 'pg';
import { householdToday, householdMinutesOfDay, minutesFromClockTime } from '../time.js';

/**
 * The household's inbox.
 *
 * Reminders run on a timer rather than lazily, which is the one place this
 * project departs from the pattern everywhere else. A reminder has to happen
 * when nobody is looking - that is the entire point of it - so there is nothing
 * to hang a lazy read on. The laptop stays awake, so a timer is dependable.
 *
 * The sweep is still written as a reconciliation rather than as an event: it
 * asks whether a chore is unfinished, whether the time has passed, and whether
 * anyone has been told, so it produces the same result whether it runs once at
 * 8:45pm or for the first time at 9:20pm after a restart. Nothing depends on the
 * process having been alive at a particular instant.
 */

export type NotificationKind =
  | 'chore_reminder'
  | 'chore_escalation'
  | 'chore_approved'
  | 'chore_rejected'
  | 'reward_decided'
  | 'bonus_posted'
  | 'general';

export type NotificationTone = 'done' | 'waiting' | 'late' | 'info';

export interface NotificationInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  tone?: NotificationTone;
  /** Hash-router path, because the frontend uses HashRouter on Pages. */
  deepLink?: string;
  choreInstanceId?: string;
  rewardRedemptionId?: string;
}

/**
 * Writes one notification, or does nothing if that person has already been told
 * this about this thing. Never throws on a duplicate.
 */
export async function notify(
  db: pg.Pool | pg.PoolClient,
  input: NotificationInput,
): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO notifications
       (user_id, kind, title, body, tone, deep_link, chore_instance_id, reward_redemption_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      input.userId,
      input.kind,
      input.title,
      input.body ?? '',
      input.tone ?? 'info',
      input.deepLink ?? null,
      input.choreInstanceId ?? null,
      input.rewardRedemptionId ?? null,
    ],
  );
  return rows.length > 0;
}

export interface SweepResult {
  reminders: number;
  escalations: number;
}

/**
 * Sends today's reminders and escalations for anything still unfinished.
 *
 * The 8:45pm reminder goes to the child alone: it is the moment their
 * punctuality bonus is about to lapse, so it is a chance to act rather than a
 * report to management. The 11:00pm escalation goes to the parents, because by
 * then it is a household matter rather than something the child is about to fix.
 */
export async function sweepReminders(
  db: pg.Pool,
  timeZone: string,
  now = new Date(),
): Promise<SweepResult> {
  const { rows: settingsRows } = await db.query<{
    reminder_time: string;
    escalation_time: string;
  }>(
    `SELECT to_char(reminder_time, 'HH24:MI') AS reminder_time,
            to_char(escalation_time, 'HH24:MI') AS escalation_time
       FROM household_settings`,
  );
  const settings = settingsRows[0];
  if (!settings) return { reminders: 0, escalations: 0 };

  const today = householdToday(timeZone, now);
  const minutesNow = householdMinutesOfDay(timeZone, now);
  const pastReminder = minutesNow >= minutesFromClockTime(settings.reminder_time);
  const pastEscalation = minutesNow >= minutesFromClockTime(settings.escalation_time);

  if (!pastReminder) return { reminders: 0, escalations: 0 };

  // Today's core chores that are not finished and not waiting on a parent.
  const { rows: outstanding } = await db.query<{
    id: string;
    chore_name: string;
    child_id: string;
    child_name: string;
  }>(
    `SELECT ci.id, d.name AS chore_name, u.id AS child_id, u.display_name AS child_name
       FROM chore_instances ci
       JOIN chore_definitions d ON d.id = ci.chore_definition_id
       JOIN users u ON u.id = ci.assigned_to
      WHERE d.kind = 'core'
        AND ci.chore_date = $1::date
        AND ci.status IN ('not_started', 'in_progress', 'rejected')
        AND u.is_active`,
    [today],
  );

  if (outstanding.length === 0) return { reminders: 0, escalations: 0 };

  const { rows: parents } = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'parent' AND is_active`,
  );

  let reminders = 0;
  let escalations = 0;

  for (const chore of outstanding) {
    const sent = await notify(db, {
      userId: chore.child_id,
      kind: 'chore_reminder',
      title: `${chore.chore_name} is not done yet`,
      body: 'Finish it now to keep your on-time bonus.',
      tone: 'waiting',
      deepLink: `#/child/chore/${chore.id}`,
      choreInstanceId: chore.id,
    });
    if (sent) reminders += 1;

    if (!pastEscalation) continue;

    for (const parent of parents) {
      const escalated = await notify(db, {
        userId: parent.id,
        kind: 'chore_escalation',
        title: `${chore.chore_name} still not done`,
        body: `${chore.child_name} has not finished it today.`,
        tone: 'late',
        deepLink: '#/parent',
        choreInstanceId: chore.id,
      });
      if (escalated) escalations += 1;
    }
  }

  return { reminders, escalations };
}
