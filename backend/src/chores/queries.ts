import type pg from 'pg';
import type { ChoreKind, ChoreStatus } from '@chore-quest/shared';
import { addHouseholdDays } from '../time.js';

/** Shapes returned to the client. Kept close to what a screen actually draws. */
export interface SubtaskRow {
  id: string;
  position: number;
  title: string;
  instruction: string | null;
  done: boolean;
}

export interface ChoreRow {
  id: string;
  name: string;
  icon: string;
  kind: ChoreKind;
  category: string | null;
  status: ChoreStatus;
  points: number;
  choreDate: string;
  rejectionNote: string | null;
  expiresAt: string | null;
  claimed: boolean;
  subtasks: SubtaskRow[];
}

const CHORE_SELECT = `
  SELECT ci.id,
         d.name,
         d.icon,
         d.kind,
         d.category,
         ci.status,
         ci.points_value AS points,
         ci.chore_date::text AS chore_date,
         ci.rejection_note,
         ci.expires_at,
         (ci.assigned_to IS NOT NULL) AS claimed,
         coalesce(
           (
             SELECT json_agg(json_build_object(
                      'id', s.id,
                      'position', s.position,
                      'title', s.title,
                      'instruction', s.instruction,
                      'done', s.done
                    ) ORDER BY s.position)
               FROM chore_instance_subtasks s
              WHERE s.chore_instance_id = ci.id
           ),
           '[]'::json
         ) AS subtasks
    FROM chore_instances ci
    JOIN chore_definitions d ON d.id = ci.chore_definition_id
`;

interface RawChore {
  id: string;
  name: string;
  icon: string;
  kind: ChoreKind;
  category: string | null;
  status: ChoreStatus;
  points: number;
  chore_date: string;
  rejection_note: string | null;
  expires_at: Date | null;
  claimed: boolean;
  subtasks: SubtaskRow[];
}

function toChore(row: RawChore): ChoreRow {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    kind: row.kind,
    category: row.category,
    status: row.status,
    points: row.points,
    choreDate: row.chore_date,
    rejectionNote: row.rejection_note,
    expiresAt: row.expires_at?.toISOString() ?? null,
    claimed: row.claimed,
    subtasks: row.subtasks,
  };
}

/** The child's own chores for one household day. */
export async function choresForDay(
  db: pg.Pool,
  childId: string,
  date: string,
): Promise<ChoreRow[]> {
  const { rows } = await db.query<RawChore>(
    `${CHORE_SELECT}
      WHERE ci.assigned_to = $1 AND ci.chore_date = $2::date
      ORDER BY d.kind DESC, d.name`,
    [childId, date],
  );
  return rows.map(toChore);
}

/** Bonus chores on offer that day: published, unclaimed, not yet expired. */
export async function availableBonusChores(
  db: pg.Pool,
  date: string,
  now: Date,
): Promise<ChoreRow[]> {
  const { rows } = await db.query<RawChore>(
    `${CHORE_SELECT}
      WHERE ci.assigned_to IS NULL
        AND d.kind = 'bonus'
        AND ci.chore_date = $1::date
        AND (ci.expires_at IS NULL OR ci.expires_at > $2)
      ORDER BY ci.points_value DESC`,
    [date, now],
  );
  return rows.map(toChore);
}

/** One chore, scoped to its owner so a guessed id reveals nothing. */
export async function choreForChild(
  db: pg.Pool,
  childId: string,
  instanceId: string,
): Promise<ChoreRow | null> {
  const { rows } = await db.query<RawChore>(
    `${CHORE_SELECT} WHERE ci.id = $1 AND ci.assigned_to = $2`,
    [instanceId, childId],
  );
  const row = rows[0];
  return row ? toChore(row) : null;
}

export interface ChildSummary {
  spendablePoints: number;
  lifetimePoints: number;
  streakDays: number;
  recentWin: { label: string; delta: number; at: string } | null;
}

/**
 * The numbers the home screen puts in its header.
 *
 * Both totals are summed from points_ledger rather than read from a column;
 * there is no stored balance anywhere, by decision.
 */
export async function childSummary(
  db: pg.Pool,
  childId: string,
  today: string,
): Promise<ChildSummary> {
  const { rows: totals } = await db.query<{ spendable: number; lifetime: number }>(
    `SELECT coalesce(sum(delta), 0)::int AS spendable,
            coalesce(sum(delta) FILTER (WHERE delta > 0), 0)::int AS lifetime
       FROM points_ledger WHERE child_id = $1`,
    [childId],
  );

  const { rows: recent } = await db.query<{ label: string; delta: number; created_at: Date }>(
    `SELECT label, delta, created_at FROM points_ledger
      WHERE child_id = $1 AND delta > 0
      ORDER BY created_at DESC LIMIT 1`,
    [childId],
  );

  return {
    spendablePoints: totals[0]?.spendable ?? 0,
    lifetimePoints: totals[0]?.lifetime ?? 0,
    streakDays: await streakLength(db, childId, today),
    recentWin: recent[0]
      ? { label: recent[0].label, delta: recent[0].delta, at: recent[0].created_at.toISOString() }
      : null,
  };
}

/**
 * Consecutive days, counting back, where every core chore was approved.
 *
 * Today is skipped when it is still unfinished: a streak should not read as
 * broken at breakfast just because the day's chores have not been done yet. An
 * excused day does not break the streak but does not extend it either, which is
 * what "paused" means on the streak calendar.
 */
async function streakLength(db: pg.Pool, childId: string, today: string): Promise<number> {
  const { rows } = await db.query<{ chore_date: string; state: string }>(
    `SELECT ci.chore_date::text AS chore_date,
            CASE
              WHEN bool_and(ci.status = 'approved') THEN 'done'
              WHEN bool_and(ci.status IN ('approved', 'excused')) THEN 'paused'
              WHEN bool_or(ci.status IN ('missed', 'rejected')) THEN 'broken'
              ELSE 'pending'
            END AS state
       FROM chore_instances ci
       JOIN chore_definitions d ON d.id = ci.chore_definition_id
      WHERE ci.assigned_to = $1
        AND d.kind = 'core'
        AND ci.chore_date <= $2::date
        AND ci.chore_date > ($2::date - interval '400 days')
      GROUP BY ci.chore_date
      ORDER BY ci.chore_date DESC`,
    [childId, today],
  );

  let streak = 0;
  let expected = today;

  for (const row of rows) {
    if (row.chore_date !== expected) break; // a day with no chores at all ends it
    if (row.state === 'pending') {
      // Only tolerated for today, which is still in progress.
      if (row.chore_date !== today) break;
    } else if (row.state === 'done') {
      streak += 1;
    } else if (row.state !== 'paused') {
      break;
    }
    expected = addHouseholdDays(expected, -1);
  }

  return streak;
}
