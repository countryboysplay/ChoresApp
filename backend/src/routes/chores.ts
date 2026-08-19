import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { householdToday, isHouseholdDate } from '../time.js';
import { ensureDaysMaterialized } from '../chores/materialize.js';
import {
  availableBonusChores,
  childSummary,
  choreForChild,
  choresForDay,
} from '../chores/queries.js';

const SubtaskBody = z.object({ done: z.boolean() });

/**
 * Chore reads for the child app, plus ticking a subtask.
 *
 * Submitting for approval is not here. The specification requires a photo with
 * a completed chore and real camera capture is Stage 6, so building submission
 * now would mean building it twice.
 */
export async function choreRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;
  const requireChild = app.requireAuth(['child']);

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  /** The child's own day: their chores, the bonus board, and their totals. */
  app.get('/api/child/day', { onRequest: requireChild }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const query = request.query as { date?: string };
    const today = householdToday(env.HOUSEHOLD_TZ);
    const date = query.date ?? today;

    if (!isHouseholdDate(date)) {
      throw app.httpErrors.badRequest('date must be a calendar date, as YYYY-MM-DD.');
    }
    // A child asking for tomorrow would otherwise materialise a day early and
    // let them work ahead of the schedule a parent set.
    if (date > today) {
      throw app.httpErrors.badRequest('That day has not started yet.');
    }

    const db = pool();
    const childId = session.user.id;

    // Lazy materialisation. Safe to run on every read; see chores/materialize.ts.
    await ensureDaysMaterialized(db, childId, today);

    const [chores, bonus, summary] = await Promise.all([
      choresForDay(db, childId, date),
      availableBonusChores(db, date, new Date()),
      childSummary(db, childId, today),
    ]);

    return {
      date,
      today,
      summary,
      core: chores.filter((chore) => chore.kind === 'core'),
      bonus: chores.filter((chore) => chore.kind === 'bonus'),
      availableBonus: bonus,
    };
  });

  app.get('/api/chores/:instanceId', { onRequest: requireChild }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { instanceId } = request.params as { instanceId: string };
    if (!z.string().uuid().safeParse(instanceId).success) {
      throw app.httpErrors.notFound('No such chore.');
    }

    const chore = await choreForChild(pool(), session.user.id, instanceId);
    // Scoped to the owner, and 404 either way, so guessing an id cannot even
    // confirm that another child's chore exists.
    if (!chore) throw app.httpErrors.notFound('No such chore.');

    return { chore };
  });

  /** Tick or untick one step of a checklist. */
  app.patch(
    '/api/chores/:instanceId/subtasks/:subtaskId',
    { onRequest: requireChild },
    async (request) => {
      const session = request.session;
      if (!session) throw app.httpErrors.unauthorized();

      const { instanceId, subtaskId } = request.params as {
        instanceId: string;
        subtaskId: string;
      };
      const body = SubtaskBody.safeParse(request.body);
      if (!body.success) throw app.httpErrors.badRequest('done must be true or false.');

      const db = pool();

      // One statement, joined back to the owning chore, so a child cannot tick
      // a subtask belonging to their sibling by pairing ids from two chores.
      const { rows } = await db.query<{ id: string }>(
        `UPDATE chore_instance_subtasks s
            SET done = $3,
                done_at = CASE WHEN $3 THEN now() ELSE NULL END
           FROM chore_instances ci
          WHERE s.id = $1
            AND s.chore_instance_id = ci.id
            AND ci.id = $2
            AND ci.assigned_to = $4
            -- A finished chore is a record, not a checklist. Reopening one is a
            -- parent action (reject), not something a child can do by untick.
            AND ci.status IN ('not_started', 'in_progress', 'rejected')
          RETURNING s.id`,
        [subtaskId, instanceId, body.data.done, session.user.id],
      );

      if (rows.length === 0) {
        throw app.httpErrors.notFound('That step cannot be changed.');
      }

      // Ticking the first step starts the chore; unticking the last one puts it
      // back. Derived from the checklist so the two can never disagree.
      await db.query(
        `UPDATE chore_instances ci
            SET status = CASE
                  WHEN (SELECT count(*) FROM chore_instance_subtasks s
                         WHERE s.chore_instance_id = ci.id AND s.done) = 0
                    THEN 'not_started'::chore_status
                  ELSE 'in_progress'::chore_status
                END,
                started_at = coalesce(ci.started_at, now())
          WHERE ci.id = $1
            AND ci.status IN ('not_started', 'in_progress')`,
        [instanceId],
      );

      const chore = await choreForChild(db, session.user.id, instanceId);
      if (!chore) throw app.httpErrors.notFound('No such chore.');
      return { chore };
    },
  );
}
