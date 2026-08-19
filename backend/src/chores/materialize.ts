import type pg from 'pg';
import { addHouseholdDays, householdDaysBetween, isoWeekdayFor } from '../time.js';

/**
 * Turns chore_schedules into chore_instances for a household day.
 *
 * Lazy rather than scheduled: this runs the first time anyone opens the app on
 * a given day. The laptop this backend lives on sleeps, and a timer that fires
 * at local midnight simply does not run on a machine that is suspended - so a
 * scheduled job would need catch-up logic anyway, and then there would be two
 * code paths that have to agree on exactly what a day contains.
 *
 * Every statement is idempotent. The partial unique index on
 * (chore_definition_id, assigned_to, chore_date) means running this twice, or
 * from two requests at once, cannot produce a duplicate chore.
 */

/**
 * How far back to fill in when the app has not been opened for a while. A
 * fortnight covers a holiday; beyond that, materialising chores nobody can do
 * anything about would only bury the parent's approval queue in stale rows.
 */
export const MAX_BACKFILL_DAYS = 14;

export interface MaterializeResult {
  /** Household dates that gained at least one chore. */
  daysCreated: string[];
  choresCreated: number;
}

/**
 * Ensures `date`, and any recent day still missing, has its chores.
 *
 * Runs in one transaction so a day is either fully present - chores and their
 * subtasks - or not there at all. A half-materialised day would show a child a
 * chore with no checklist.
 */
export async function ensureDaysMaterialized(
  db: pg.Pool,
  childId: string,
  date: string,
  options: { backfillDays?: number } = {},
): Promise<MaterializeResult> {
  const backfill = Math.min(options.backfillDays ?? MAX_BACKFILL_DAYS, MAX_BACKFILL_DAYS);
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const from = await earliestMissingDay(client, childId, date, backfill);
    const result: MaterializeResult = { daysCreated: [], choresCreated: 0 };

    for (let day = from; householdDaysBetween(day, date) >= 0; day = addHouseholdDays(day, 1)) {
      const created = await materializeDay(client, childId, day);
      if (created > 0) {
        result.daysCreated.push(day);
        result.choresCreated += created;
      }
    }

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Where to start filling from: the day after the child's most recent chore, or
 * the backfill limit, whichever is later. Without this, a household returning
 * from a two-week holiday would walk 14 days of queries every single request.
 */
async function earliestMissingDay(
  client: pg.PoolClient,
  childId: string,
  date: string,
  backfillDays: number,
): Promise<string> {
  const { rows } = await client.query<{ last: string | null; joined: string }>(
    `SELECT (SELECT max(chore_date)::text FROM chore_instances WHERE assigned_to = $1) AS last,
            (created_at AT TIME ZONE 'UTC')::date::text AS joined
       FROM users WHERE id = $1`,
    [childId],
  );

  const backfillLimit = addHouseholdDays(date, -backfillDays);

  // Never earlier than the day the child was added. A schedule can legitimately
  // start in the past - a parent writing down chores the family already does -
  // but a child created this morning must not wake up to two weeks of chores
  // they never had a chance to do, dragged into the approval queue and counted
  // against their streak.
  const joined = rows[0]?.joined ?? backfillLimit;
  const floor = householdDaysBetween(backfillLimit, joined) > 0 ? joined : backfillLimit;

  const last = rows[0]?.last;
  if (!last) return floor;

  const dayAfterLast = addHouseholdDays(last, 1);
  // Already materialised through today; nothing to walk.
  if (householdDaysBetween(dayAfterLast, date) < 0) return date;

  return householdDaysBetween(floor, dayAfterLast) > 0 ? dayAfterLast : floor;
}

async function materializeDay(
  client: pg.PoolClient,
  childId: string,
  date: string,
): Promise<number> {
  const { rows } = await client.query<{ created: number }>(
    `
    WITH due AS (
      SELECT s.chore_definition_id, s.assigned_to, d.points AS points_value
        FROM chore_schedules s
        JOIN chore_definitions d ON d.id = s.chore_definition_id
       WHERE s.is_active
         AND d.is_active
         AND s.assigned_to = $1
         AND s.starts_on <= $2::date
         AND (s.ends_on IS NULL OR s.ends_on >= $2::date)
         AND (s.recurrence = 'daily' OR $3::smallint = ANY (s.days_of_week))
    ),
    inserted AS (
      INSERT INTO chore_instances (chore_definition_id, assigned_to, chore_date, points_value)
      SELECT chore_definition_id, assigned_to, $2::date, points_value FROM due
      -- Matches the partial unique index, so a second concurrent request is a
      -- no-op rather than a duplicate-key error.
      ON CONFLICT (chore_definition_id, assigned_to, chore_date)
        WHERE assigned_to IS NOT NULL
        DO NOTHING
      RETURNING id, chore_definition_id
    ),
    subtasks AS (
      -- Snapshotted, not joined. Editing the template later must not rewrite
      -- what the child was actually asked to do on this day.
      INSERT INTO chore_instance_subtasks
        (chore_instance_id, template_id, position, title, instruction)
      SELECT i.id, t.id, t.position, t.title, t.instruction
        FROM inserted i
        JOIN chore_subtask_templates t ON t.chore_definition_id = i.chore_definition_id
      RETURNING chore_instance_id
    )
    SELECT count(*)::int AS created FROM inserted
    `,
    [childId, date, isoWeekdayFor(date)],
  );

  return rows[0]?.created ?? 0;
}
