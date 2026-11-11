import type pg from 'pg';
import { ACHIEVEMENTS, type AchievementStats } from './catalogue.js';
import { streakLength } from '../chores/queries.js';
import { familyWeekXp } from '../chores/boosts.js';
import { env } from '../env.js';
import {
  addHouseholdDays,
  householdMinutesOfDay,
  householdToday,
  householdWeekStart,
  minutesFromClockTime,
} from '../time.js';

/** How far ahead of the reminder counts as a speed run. */
const SPEED_RUN_LEAD_MINUTES = 120;

/**
 * Working out which badges a child has, by asking the household rather than by
 * keeping score.
 *
 * Written as a reconciliation, the same way the reminder sweep is: it asks what
 * this child's totals are now and what that means, not what just happened. So
 * nothing is lost if the server was down when a chore was approved, a badge
 * added later is awarded on the next look rather than only to children who earn
 * it afterwards, and correcting a rule is editing the catalogue rather than
 * hunting for rows that were written under the old one.
 *
 * `earned_at` is written once and never cleared. A streak badge measures the
 * streak running now, so its meter can fall back to nothing the day a streak
 * breaks - the badge stays, because it is a record of having done it rather
 * than a status somebody can lose.
 *
 * Deliberately awards no points. Badges are for bragging rights; the ledger is
 * for work, and a badge that paid would quietly double what a chore is worth.
 */

let cataloguePresent = false;

/**
 * The table is a projection of the catalogue in code. Upserted by `code`, so a
 * renamed badge keeps its id and everybody who earned it keeps it, and a badge
 * dropped from the list is deactivated rather than deleted - the same reason
 * rewards and chores retire instead.
 */
export async function ensureCatalogue(db: pg.Pool | pg.PoolClient): Promise<void> {
  if (cataloguePresent) return;

  for (const [index, achievement] of ACHIEVEMENTS.entries()) {
    await db.query(
      `INSERT INTO achievements (code, name, description, category, icon, target, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             category = EXCLUDED.category,
             icon = EXCLUDED.icon,
             target = EXCLUDED.target,
             sort_order = EXCLUDED.sort_order,
             is_active = true`,
      [
        achievement.code,
        achievement.name,
        achievement.description,
        achievement.category,
        achievement.icon,
        achievement.target > 1 ? achievement.target : null,
        index,
      ],
    );
  }

  const codes = ACHIEVEMENTS.map((achievement) => achievement.code);
  await db.query(`UPDATE achievements SET is_active = false WHERE NOT (code = ANY($1::text[]))`, [
    codes,
  ]);

  cataloguePresent = true;
}

/** Every number the catalogue can measure, in one round trip. */
export async function achievementStats(
  db: pg.Pool,
  childId: string,
  today: string,
): Promise<AchievementStats> {
  const { rows } = await db.query<{
    core_approved: number;
    bonus_approved: number;
    punctual: number;
    lifetime_points: number;
    rewards_redeemed: number;
    perfect_weeks: number;
    clean_sweeps: number;
    goal: number | null;
    reminder_time: string;
  }>(
    `SELECT
       (SELECT count(*)::int FROM chore_instances ci
          JOIN chore_definitions d ON d.id = ci.chore_definition_id
         WHERE ci.assigned_to = $1 AND ci.status = 'approved' AND d.kind = 'core') AS core_approved,
       (SELECT count(*)::int FROM chore_instances ci
          JOIN chore_definitions d ON d.id = ci.chore_definition_id
         WHERE ci.assigned_to = $1 AND ci.status = 'approved' AND d.kind = 'bonus') AS bonus_approved,
       (SELECT count(*)::int FROM chore_instances
         WHERE assigned_to = $1 AND status = 'approved' AND submitted_punctual) AS punctual,
       (SELECT coalesce(sum(xp), 0)::int FROM xp_ledger WHERE child_id = $1) AS lifetime_points,
       -- Asked for and not refused. A denied request was refunded and never
       -- cost this child anything, so it is not something they spent points on.
       (SELECT count(*)::int FROM reward_redemptions
         WHERE child_id = $1 AND status <> 'denied' AND status <> 'cancelled') AS rewards_redeemed,
       -- Weeks bucketed by date arithmetic on chore_date (Monday = isodow 1),
       -- never by timezone. Seven distinct days, so a week with a chore-free day
       -- is not "every day Mon-Sun". Only past days are counted (<= today).
       (SELECT count(*)::int FROM (
          SELECT bool_and(ci.status = 'approved') AS ok, count(DISTINCT ci.chore_date) AS days
            FROM chore_instances ci
            JOIN chore_definitions d ON d.id = ci.chore_definition_id
           WHERE ci.assigned_to = $1 AND d.kind = 'core' AND ci.chore_date <= $2::date
           GROUP BY ci.chore_date - (extract(isodow FROM ci.chore_date)::int - 1)
        ) w WHERE w.ok AND w.days = 7) AS perfect_weeks,
       (SELECT count(*)::int FROM (
          SELECT ci.chore_date
            FROM chore_instances ci
            JOIN chore_definitions d ON d.id = ci.chore_definition_id
           WHERE ci.assigned_to = $1 AND d.kind = 'core'
           GROUP BY ci.chore_date
          HAVING count(*) >= 2
             AND bool_and(ci.status = 'approved' AND coalesce(ci.submitted_punctual, false))
        ) s) AS clean_sweeps,
       (SELECT weekly_xp_goal FROM household_settings) AS goal,
       (SELECT reminder_time::text FROM household_settings) AS reminder_time`,
    [childId, today],
  );

  // Speed runs need the submission's household clock time, which is Intl's
  // job, not Postgres's (DECISIONS: household time is computed with Intl).
  // shortcut: measured against today's reminder_time, so moving the reminder
  // re-scores past chores; store the margin at submission if that ever matters.
  const { rows: punctual } = await db.query<{ submitted_at: Date; chore_date: string }>(
    `SELECT submitted_at, chore_date::text AS chore_date FROM chore_instances
      WHERE assigned_to = $1 AND status = 'approved' AND submitted_punctual AND submitted_at IS NOT NULL`,
    [childId],
  );
  const cutoff = minutesFromClockTime(rows[0]?.reminder_time ?? '20:45') - SPEED_RUN_LEAD_MINUTES;
  const speedRuns = punctual.filter(
    (chore) =>
      householdToday(env.HOUSEHOLD_TZ, chore.submitted_at) === chore.chore_date &&
      householdMinutesOfDay(env.HOUSEHOLD_TZ, chore.submitted_at) < cutoff,
  ).length;

  // This week and last, so a goal hit on Sunday night is still awarded to a
  // child who next opens the app on Monday.
  // shortcut: older weeks are not looked at. The approval that crosses the goal
  // syncs every child, and each child is synced again whenever their badges are
  // read, so only a goal reached and unseen for over a week could be missed.
  let teamGoalWeeks = 0;
  const goal = rows[0]?.goal ?? null;
  if (goal !== null) {
    const thisWeek = householdWeekStart(today);
    for (const weekStart of [thisWeek, addHouseholdDays(thisWeek, -7)]) {
      const { total, mine } = await familyWeekXp(db, weekStart, childId);
      if (total >= goal && mine > 0) teamGoalWeeks += 1;
    }
  }

  const row = rows[0];
  return {
    coreApproved: row?.core_approved ?? 0,
    bonusApproved: row?.bonus_approved ?? 0,
    punctual: row?.punctual ?? 0,
    lifetimePoints: row?.lifetime_points ?? 0,
    rewardsRedeemed: row?.rewards_redeemed ?? 0,
    streakDays: await streakLength(db, childId, today),
    perfectWeeks: row?.perfect_weeks ?? 0,
    speedRuns,
    cleanSweeps: row?.clean_sweeps ?? 0,
    teamGoalWeeks,
  };
}

export interface StreakDayRow {
  date: string;
  state: 'done' | 'missed' | 'paused' | 'none';
}

/**
 * The last four weeks, read the way a streak is read.
 *
 * The same rule streakLength applies, day by day: every core chore approved is
 * a day done, any one marked missed breaks it, and anything else - unfinished,
 * still waiting, excused - is a pause. A day with no core chores at all is
 * nothing rather than a hole, because a Sunday off is not a failure.
 *
 * Days are filled in rather than only those with rows, so four weeks is always
 * twenty-eight squares and the grid does not shuffle as the household uses it.
 */
export async function streakCalendar(
  db: pg.Pool,
  childId: string,
  today: string,
  days = 28,
): Promise<StreakDayRow[]> {
  const { rows } = await db.query<{ date: string; all_done: boolean; any_missed: boolean }>(
    `SELECT ci.chore_date::text AS date,
            bool_and(ci.status = 'approved') AS all_done,
            bool_or(ci.status = 'missed') AS any_missed
       FROM chore_instances ci
       JOIN chore_definitions d ON d.id = ci.chore_definition_id
      WHERE ci.assigned_to = $1
        AND d.kind = 'core'
        AND ci.chore_date > ($2::date - $3::int)
        AND ci.chore_date <= $2::date
      GROUP BY ci.chore_date`,
    [childId, today, days],
  );

  const byDate = new Map(rows.map((row) => [row.date, row]));
  const out: StreakDayRow[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const date = addHouseholdDays(today, -back);
    const row = byDate.get(date);
    out.push({
      date,
      state: !row ? 'none' : row.any_missed ? 'missed' : row.all_done ? 'done' : 'paused',
    });
  }
  return out;
}

export interface AchievementRow {
  code: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  target: number;
  progress: number;
  earnedAt: string | null;
}

export interface SyncResult {
  achievements: AchievementRow[];
  /** Earned by this call, for whoever wants to say well done. */
  newlyEarned: AchievementRow[];
}

/**
 * Recompute every badge for one child and write what changed.
 *
 * Safe to call as often as anybody likes: it is the same answer every time for
 * the same household state, which is what lets it sit on a read.
 */
export async function syncAchievements(
  db: pg.Pool,
  childId: string,
  today: string,
): Promise<SyncResult> {
  await ensureCatalogue(db);
  const stats = await achievementStats(db, childId, today);

  const { rows: catalogue } = await db.query<{ id: string; code: string }>(
    `SELECT id, code FROM achievements WHERE is_active`,
  );
  const idByCode = new Map(catalogue.map((row) => [row.code, row.id]));

  /*
   * What this child already had, read once before anything is written.
   *
   * "Newly earned" has to be decided against the state before this call, and
   * reading it back out of the same statement that writes it would depend on
   * exactly which snapshot a subquery in RETURNING sees. This is one more query
   * and no cleverness at all.
   */
  const { rows: existing } = await db.query<{ code: string; earned_at: Date | null }>(
    `SELECT a.code, c.earned_at
       FROM child_achievements c
       JOIN achievements a ON a.id = c.achievement_id
      WHERE c.child_id = $1`,
    [childId],
  );
  const earnedBefore = new Set(
    existing.filter((row) => row.earned_at !== null).map((row) => row.code),
  );

  const achievements: AchievementRow[] = [];
  const newlyEarned: AchievementRow[] = [];

  for (const definition of ACHIEVEMENTS) {
    const id = idByCode.get(definition.code);
    if (!id) continue;

    const progress = Math.max(0, definition.measure(stats));
    const reached = progress >= definition.target;

    // coalesce keeps the original moment, so a badge earned in June still says
    // June after a streak breaks and comes back.
    const { rows } = await db.query<{ earned_at: Date | null }>(
      `INSERT INTO child_achievements (child_id, achievement_id, progress, earned_at)
       VALUES ($1, $2, $3, CASE WHEN $4 THEN now() ELSE NULL END)
       ON CONFLICT (child_id, achievement_id) DO UPDATE
         SET progress = EXCLUDED.progress,
             earned_at = coalesce(child_achievements.earned_at, EXCLUDED.earned_at)
       RETURNING earned_at`,
      [childId, id, progress, reached],
    );

    const earnedAt = rows[0]?.earned_at ?? null;
    const row: AchievementRow = {
      code: definition.code,
      name: definition.name,
      description: definition.description,
      category: definition.category,
      icon: definition.icon,
      target: definition.target,
      progress: Math.min(progress, definition.target),
      earnedAt: earnedAt ? earnedAt.toISOString() : null,
    };
    achievements.push(row);

    if (earnedAt && !earnedBefore.has(definition.code)) newlyEarned.push(row);
  }

  return { achievements, newlyEarned };
}
