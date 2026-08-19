import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { addHouseholdDays, householdToday, householdWeekStart } from '../time.js';
import { ResolveError, resolveChore, type Resolution } from '../chores/resolve.js';
import { releaseExpiredClaims } from '../chores/bonus.js';

const ResolveBody = z.object({
  outcome: z.enum(['excused', 'missed', 'carried_over']),
});

/**
 * The parent dashboard, and the actions it offers.
 *
 * Everything here is a reading of data other stages already produce. The one
 * thing it adds is closing out a chore nobody finished, which is the only way a
 * chore is ever recorded as missed.
 */
export async function dashboardRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;
  const requireParent = app.requireAuth(['parent']);

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  app.get('/api/parent/dashboard', { onRequest: requireParent }, async () => {
    const db = pool();
    const today = householdToday(env.HOUSEHOLD_TZ);
    const weekStart = householdWeekStart(today);
    // Keeps the board honest before the counts below are taken from it.
    await releaseExpiredClaims(db);

    const { rows: children } = await db.query(
      `SELECT u.id, u.display_name, u.avatar,
              coalesce((SELECT sum(delta) FROM points_ledger p WHERE p.child_id = u.id), 0)::int AS balance,
              coalesce((SELECT sum(delta) FROM points_ledger p
                         WHERE p.child_id = u.id AND p.delta > 0
                           AND p.created_at >= $1::date), 0)::int AS week_points
         FROM users u
        WHERE u.role = 'child' AND u.is_active
        ORDER BY u.sort_order, u.display_name`,
      [weekStart],
    );

    const { rows: counts } = await db.query<{
      pending_approvals: number;
      pending_rewards: number;
      done_this_week: number;
      due_this_week: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM chore_instances WHERE status = 'submitted') AS pending_approvals,
         (SELECT count(*)::int FROM reward_redemptions WHERE status = 'requested') AS pending_rewards,
         (SELECT count(*)::int FROM chore_instances ci JOIN chore_definitions d ON d.id = ci.chore_definition_id
           WHERE d.kind = 'core' AND ci.status = 'approved' AND ci.chore_date >= $1::date) AS done_this_week,
         (SELECT count(*)::int FROM chore_instances ci JOIN chore_definitions d ON d.id = ci.chore_definition_id
           WHERE d.kind = 'core' AND ci.chore_date >= $1::date AND ci.chore_date <= $2::date) AS due_this_week`,
      [weekStart, today],
    );

    /**
     * Chores from a day that has passed which nobody finished and no parent has
     * decided about. These are the only rows that can be resolved.
     */
    const { rows: unresolved } = await db.query(
      `SELECT ci.id, ci.chore_date::text AS chore_date, ci.status, ci.points_value,
              d.name AS chore_name, d.icon AS chore_icon,
              u.id AS child_id, u.display_name AS child_name
         FROM chore_instances ci
         JOIN chore_definitions d ON d.id = ci.chore_definition_id
         JOIN users u ON u.id = ci.assigned_to
        WHERE d.kind = 'core'
          AND ci.chore_date < $1::date
          AND ci.status IN ('not_started', 'in_progress', 'rejected')
        ORDER BY ci.chore_date, u.display_name`,
      [today],
    );

    const { rows: activity } = await db.query(
      `SELECT ci.assigned_to AS child_id, ci.chore_date::text AS chore_date,
              count(*) FILTER (WHERE ci.status = 'approved')::int AS approved,
              count(*) FILTER (WHERE ci.status = 'missed')::int AS missed,
              coalesce(sum(ci.points_awarded), 0)::int AS points
         FROM chore_instances ci
         JOIN chore_definitions d ON d.id = ci.chore_definition_id
        WHERE d.kind = 'core'
          AND ci.assigned_to IS NOT NULL
          AND ci.chore_date >= $1::date
          AND ci.chore_date <= $2::date
        GROUP BY ci.assigned_to, ci.chore_date`,
      [addHouseholdDays(today, -6), today],
    );

    return {
      today,
      weekStart,
      children: children.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        avatar: row.avatar,
        balance: row.balance,
        weekPoints: row.week_points,
      })),
      counts: {
        pendingApprovals: counts[0]?.pending_approvals ?? 0,
        pendingRewardRequests: counts[0]?.pending_rewards ?? 0,
        choresDoneThisWeek: counts[0]?.done_this_week ?? 0,
        choresDueThisWeek: counts[0]?.due_this_week ?? 0,
      },
      needsAttention: unresolved.map((row) => ({
        id: row.id,
        choreName: row.chore_name,
        choreIcon: row.chore_icon,
        choreDate: row.chore_date,
        points: row.points_value,
        status: row.status,
        child: { id: row.child_id, displayName: row.child_name },
      })),
      weekActivity: activity.map((row) => ({
        childId: row.child_id,
        date: row.chore_date,
        approved: row.approved,
        missed: row.missed,
        points: row.points,
      })),
    };
  });

  /** Excuse, carry over, or record as missed. */
  app.post(
    '/api/parent/chores/:instanceId/resolve',
    { onRequest: requireParent },
    async (request) => {
      const session = request.session;
      if (!session) throw app.httpErrors.unauthorized();

      const { instanceId } = request.params as { instanceId: string };
      if (!z.string().uuid().safeParse(instanceId).success) {
        throw app.httpErrors.notFound('No such chore.');
      }

      const body = ResolveBody.safeParse(request.body);
      if (!body.success) {
        throw app.httpErrors.badRequest('Choose excused, missed, or carried over.');
      }

      try {
        return {
          result: await resolveChore(
            pool(),
            session.user.id,
            instanceId,
            body.data.outcome as Resolution,
            householdToday(env.HOUSEHOLD_TZ),
          ),
        };
      } catch (error) {
        if (error instanceof ResolveError) {
          if (error.kind === 'not_found') throw app.httpErrors.notFound(error.message);
          throw app.httpErrors.conflict(error.message);
        }
        throw error;
      }
    },
  );

  /** Who owes what across the week, read from the schedules themselves. */
  app.get('/api/parent/schedule', { onRequest: requireParent }, async () => {
    const { rows } = await pool().query(
      `SELECT s.id, s.recurrence, s.days_of_week, s.starts_on::text AS starts_on,
              s.ends_on::text AS ends_on,
              d.id AS chore_id, d.name AS chore_name, d.icon AS chore_icon, d.points,
              u.id AS child_id, u.display_name AS child_name
         FROM chore_schedules s
         JOIN chore_definitions d ON d.id = s.chore_definition_id
         JOIN users u ON u.id = s.assigned_to
        WHERE s.is_active AND d.is_active AND u.is_active
        ORDER BY u.sort_order, u.display_name, d.name`,
    );

    return {
      schedules: rows.map((row) => ({
        id: row.id,
        choreId: row.chore_id,
        choreName: row.chore_name,
        choreIcon: row.chore_icon,
        points: row.points,
        child: { id: row.child_id, displayName: row.child_name },
        recurrence: row.recurrence,
        // Empty for a daily chore; the screen fills every day in that case.
        daysOfWeek: row.days_of_week,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
      })),
    };
  });
}
