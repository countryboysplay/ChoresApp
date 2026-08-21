import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ChildProfileResponse, LeaderboardResponse, StandingEntry } from '@chore-quest/shared';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { streakLength } from '../chores/queries.js';
import { householdToday, householdWeekStart } from '../time.js';

/**
 * Where a child stands: the leaderboard, and their own profile screen.
 *
 * Both screens existed from Stage 2 reading `mock/data.ts`, which meant every
 * child saw a stranger's name on the podium and a stranger's totals on their own
 * profile. Everything either one needs was already being computed for somebody
 * else - the ledger totals for the wallet, the streak for the home screen - so
 * this is a reading of what the household already knows rather than anything new.
 *
 * Children only. Parents may read the board, because a parent asking who is
 * ahead is a fair question, but no parent is ever *on* it: the query selects
 * `role = 'child'` and a test asserts no parent name renders.
 */
export async function standingRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  /**
   * Every active child, ranked the way the board reads: lifetime points first,
   * the longer streak breaking a tie, then the name so the order never wobbles
   * between two children who have done exactly the same.
   *
   * The week window is `householdWeekStart`, the same one the parent dashboard
   * uses, so "points this week" cannot mean two different things on two screens.
   */
  async function standings(): Promise<StandingEntry[]> {
    const db = pool();
    const today = householdToday(env.HOUSEHOLD_TZ);
    const weekStart = householdWeekStart(today);

    const { rows } = await db.query<{
      id: string;
      display_name: string;
      avatar: unknown;
      lifetime: number;
      week: number;
      approved: number;
    }>(
      `SELECT u.id, u.display_name, u.avatar,
              coalesce((SELECT sum(delta) FROM points_ledger p
                         WHERE p.child_id = u.id AND p.delta > 0), 0)::int AS lifetime,
              coalesce((SELECT sum(delta) FROM points_ledger p
                         WHERE p.child_id = u.id AND p.delta > 0
                           AND p.created_at >= $1::date), 0)::int AS week,
              coalesce((SELECT count(*) FROM chore_instances ci
                         WHERE ci.assigned_to = u.id AND ci.status = 'approved'), 0)::int AS approved
         FROM users u
        WHERE u.role = 'child' AND u.is_active
        ORDER BY u.sort_order, u.display_name`,
      [weekStart],
    );

    const entries: StandingEntry[] = [];
    for (const row of rows) {
      entries.push({
        id: row.id,
        displayName: row.display_name,
        avatar: row.avatar,
        lifetimePoints: row.lifetime,
        weekPoints: row.week,
        streakDays: await streakLength(db, row.id, today),
        choresApproved: row.approved,
      });
    }

    entries.sort(
      (a, b) =>
        b.lifetimePoints - a.lifetimePoints ||
        b.streakDays - a.streakDays ||
        a.displayName.localeCompare(b.displayName),
    );
    return entries;
  }

  app.get(
    '/api/child/leaderboard',
    { onRequest: app.requireAuth(['child', 'parent']) },
    async (request): Promise<LeaderboardResponse> => {
      const session = request.session;
      const entries = await standings();
      return {
        entries,
        // Null for a parent, who is reading rather than competing.
        meId: session?.user.role === 'child' ? session.user.id : null,
      };
    },
  );

  app.get(
    '/api/child/profile',
    { onRequest: app.requireAuth(['child']) },
    async (request): Promise<ChildProfileResponse> => {
      const session = request.session;
      if (!session) throw app.httpErrors.unauthorized();

      const db = pool();
      const childId = session.user.id;

      const me = (await standings()).find((entry) => entry.id === childId);
      // A child whose account was deactivated mid-session has a valid cookie and
      // no row on the board. Saying so beats rendering somebody else's totals,
      // which is the bug this whole file exists to end.
      if (!me) throw app.httpErrors.notFound('That child is no longer in the household.');

      const { rows: spend } = await db.query<{ spendable: number }>(
        `SELECT coalesce(sum(delta), 0)::int AS spendable FROM points_ledger WHERE child_id = $1`,
        [childId],
      );

      const { rows: goal } = await db.query<{ id: string; name: string; point_cost: number }>(
        `SELECT r.id, r.name, r.point_cost
           FROM child_reward_preferences p
           JOIN rewards r ON r.id = p.reward_id
          WHERE p.child_id = $1 AND p.is_primary_goal AND r.is_active
          LIMIT 1`,
        [childId],
      );

      return {
        me,
        spendablePoints: spend[0]?.spendable ?? 0,
        primaryGoal: goal[0]
          ? { id: goal[0].id, name: goal[0].name, pointCost: goal[0].point_cost }
          : null,
      };
    },
  );

  /**
   * A child changing their own hero.
   *
   * The avatar builder has always worked and has never saved, so every child in
   * every household is still wearing the default. It is the one thing on that
   * screen that is theirs, so it is theirs to change - unlike a display name or
   * a PIN, which stay with a parent.
   */
  const avatarBody = z.object({ avatar: z.record(z.string(), z.unknown()) });

  app.patch(
    '/api/child/profile',
    { onRequest: app.requireAuth(['child']) },
    async (request) => {
      const session = request.session;
      if (!session) throw app.httpErrors.unauthorized();

      const { avatar } = avatarBody.parse(request.body);
      await pool().query(`UPDATE users SET avatar = $1 WHERE id = $2 AND role = 'child'`, [
        JSON.stringify(avatar),
        session.user.id,
      ]);
      return { ok: true as const };
    },
  );
}
