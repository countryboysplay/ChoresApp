import type pg from 'pg';
import { addHouseholdDays, householdWeekStart } from '../time.js';

/**
 * XP boosts and the weekly family goal. Both are XP only: nothing here writes
 * to points_ledger or reads a balance. See DECISIONS.md, 2026-11-10.
 */

/** A boost armed on a chore that can never be approved is free to use again. */
const DEAD = `('missed', 'excused', 'carried_over')`;

/**
 * Grant one boost per multiple of 7 the current streak run has reached.
 *
 * A reconciliation, like the badges: the unique (child, run start, milestone)
 * key means asking twice, or after the server was down, grants nothing extra.
 */
export async function syncBoosts(
  db: pg.Pool | pg.PoolClient,
  childId: string,
  streak: { days: number; start: string | null },
): Promise<void> {
  if (!streak.start) return;
  for (let milestone = 7; milestone <= streak.days; milestone += 7) {
    await db.query(
      // A run's start moves earlier when a paused day before it is approved late.
      // A boost for this milestone starting on or after today's start can only
      // be this same run's (earlier runs start earlier), so it is not paid twice.
      `INSERT INTO boosts (child_id, streak_start, milestone)
       SELECT $1, $2::date, $3
        WHERE NOT EXISTS (
          SELECT 1 FROM boosts
           WHERE child_id = $1 AND milestone = $3 AND streak_start >= $2::date)
       ON CONFLICT (child_id, streak_start, milestone) DO NOTHING`,
      [childId, streak.start, milestone],
    );
  }
}

export async function availableBoosts(db: pg.Pool | pg.PoolClient, childId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM boosts b
       LEFT JOIN chore_instances ci ON ci.id = b.chore_instance_id
      WHERE b.child_id = $1 AND (b.chore_instance_id IS NULL OR ci.status IN ${DEAD})`,
    [childId],
  );
  return rows[0]?.n ?? 0;
}

/** Statuses a boost can be armed on or taken off: anything not yet decided. */
export const ARMABLE = ['not_started', 'in_progress', 'submitted', 'rejected'];

/**
 * Arm a free boost on one of this child's undecided chores. The chore row is
 * locked so this queues behind an approval in progress, and an approval queues
 * behind it - a boost can never land on a chore after it has been paid.
 */
export async function armBoost(
  client: pg.PoolClient,
  childId: string,
  instanceId: string,
): Promise<'ok' | 'not_found' | 'decided' | 'already' | 'none'> {
  const { rows } = await client.query<{ status: string }>(
    `SELECT status FROM chore_instances WHERE id = $1 AND assigned_to = $2 FOR UPDATE`,
    [instanceId, childId],
  );
  const chore = rows[0];
  if (!chore) return 'not_found';
  if (!ARMABLE.includes(chore.status)) return 'decided';

  const { rowCount: armed } = await client.query(
    `SELECT 1 FROM boosts WHERE chore_instance_id = $1`,
    [instanceId],
  );
  if (armed) return 'already';

  const { rowCount } = await client.query(
    `UPDATE boosts SET chore_instance_id = $2, armed_at = now()
      WHERE id = (
        SELECT b.id FROM boosts b
          LEFT JOIN chore_instances ci ON ci.id = b.chore_instance_id
         WHERE b.child_id = $1 AND (b.chore_instance_id IS NULL OR ci.status IN ${DEAD})
         ORDER BY b.earned_at
         LIMIT 1
         -- SKIP LOCKED: two chores armed at once each take a different free boost,
         -- instead of the second waiting on the first and then finding none.
         FOR UPDATE OF b SKIP LOCKED
      )`,
    [childId, instanceId],
  );
  return rowCount ? 'ok' : 'none';
}

export async function disarmBoost(
  client: pg.PoolClient,
  childId: string,
  instanceId: string,
): Promise<'ok' | 'not_found' | 'decided'> {
  const { rows } = await client.query<{ status: string }>(
    `SELECT status FROM chore_instances WHERE id = $1 AND assigned_to = $2 FOR UPDATE`,
    [instanceId, childId],
  );
  const chore = rows[0];
  if (!chore) return 'not_found';
  if (!ARMABLE.includes(chore.status)) return 'decided';
  await client.query(
    `UPDATE boosts SET chore_instance_id = NULL, armed_at = NULL
      WHERE chore_instance_id = $1 AND child_id = $2`,
    [instanceId, childId],
  );
  return 'ok';
}

export interface FamilyGoal {
  target: number;
  reward: string | null;
  xp: number;
  weekStart: string;
}

/**
 * XP every child earned in a household week. `created_at >= date` is the same
 * week window the leaderboard and parent dashboard already use.
 */
/**
 * A chore going back on the board (given back, or its claim lapsed) hands its
 * boost back to whoever armed it, so it is not stranded on someone else's chore.
 */
export async function releaseBoosts(db: pg.Pool | pg.PoolClient, choreIds: string[]): Promise<void> {
  await db.query(
    `UPDATE boosts SET chore_instance_id = NULL, armed_at = NULL WHERE chore_instance_id = ANY($1::uuid[])`,
    [choreIds],
  );
}

export async function familyWeekXp(
  db: pg.Pool | pg.PoolClient,
  weekStart: string,
  childId: string | null = null,
): Promise<{ total: number; mine: number }> {
  const { rows } = await db.query<{ total: number; mine: number }>(
    `SELECT coalesce(sum(xp), 0)::int AS total,
            coalesce(sum(xp) FILTER (WHERE child_id = $3), 0)::int AS mine
       FROM xp_ledger
      WHERE created_at >= $1::date AND created_at < $2::date`,
    [weekStart, addHouseholdDays(weekStart, 7), childId],
  );
  return { total: rows[0]?.total ?? 0, mine: rows[0]?.mine ?? 0 };
}

/** The household's goal for the week `today` is in, or null when none is set. */
export async function familyGoal(db: pg.Pool | pg.PoolClient, today: string): Promise<FamilyGoal | null> {
  const { rows } = await db.query<{ weekly_xp_goal: number | null; weekly_goal_reward: string | null }>(
    `SELECT weekly_xp_goal, weekly_goal_reward FROM household_settings`,
  );
  const target = rows[0]?.weekly_xp_goal ?? null;
  if (target === null) return null;
  const weekStart = householdWeekStart(today);
  return {
    target,
    reward: rows[0]?.weekly_goal_reward ?? null,
    xp: (await familyWeekXp(db, weekStart)).total,
    weekStart,
  };
}
