import type { FastifyInstance } from 'fastify';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { streakCalendar, syncAchievements } from '../achievements/service.js';
import { householdToday } from '../time.js';

/**
 * A child's badges.
 *
 * Reconciled on read rather than served from a table somebody hopes is current.
 * It is the same answer every time for the same household state, so putting it
 * on the read costs one recompute and removes every way the two could drift.
 */
export async function achievementRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  app.get('/api/child/achievements', { onRequest: app.requireAuth(['child']) }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const db = pool();
    const today = householdToday(env.HOUSEHOLD_TZ);
    const { achievements } = await syncAchievements(db, session.user.id, today);

    return { achievements, streakCalendar: await streakCalendar(db, session.user.id, today) };
  });
}
