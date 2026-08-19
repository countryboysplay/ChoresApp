import type { FastifyInstance } from 'fastify';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { householdToday, householdWeekStart } from '../time.js';

/**
 * The wallet: what a child has, and every line explaining how they got it.
 *
 * Cash-out is reported as configured or not rather than hidden. The rate and
 * the minimum are deliberately unset - the specification forbids inventing
 * either - so the screen renders its "turned off" state until an owner supplies
 * them in Settings, and this endpoint is what tells it which state to be in.
 */
export async function walletRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  app.get('/api/child/wallet', { onRequest: app.requireAuth(['child']) }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const db = pool();
    const childId = session.user.id;
    const weekStart = householdWeekStart(householdToday(env.HOUSEHOLD_TZ));

    const { rows: totals } = await db.query<{ spendable: number; lifetime: number; spent: number }>(
      `SELECT coalesce(sum(delta), 0)::int AS spendable,
              coalesce(sum(delta) FILTER (WHERE delta > 0), 0)::int AS lifetime,
              coalesce(-sum(delta) FILTER (WHERE delta < 0), 0)::int AS spent
         FROM points_ledger WHERE child_id = $1`,
      [childId],
    );

    const { rows: history } = await db.query<{
      id: string;
      delta: number;
      reason: string;
      label: string;
      created_at: Date;
    }>(
      `SELECT id, delta, reason, label, created_at
         FROM points_ledger WHERE child_id = $1
        ORDER BY created_at DESC LIMIT 100`,
      [childId],
    );

    const { rows: settings } = await db.query<{
      points_per_dollar: number | null;
      minimum_cash_out_points: number | null;
      weekly_cash_out_cap_cents: number;
    }>(
      `SELECT points_per_dollar, minimum_cash_out_points, weekly_cash_out_cap_cents
         FROM household_settings`,
    );

    const { rows: cashedOut } = await db.query<{ cents: number }>(
      `SELECT coalesce(sum(amount_cents), 0)::int AS cents
         FROM cash_out_requests
        WHERE child_id = $1 AND week_start = $2::date AND status <> 'denied'`,
      [childId, weekStart],
    );

    const config = settings[0];
    const rate = config?.points_per_dollar ?? null;
    const minimum = config?.minimum_cash_out_points ?? null;
    const spendable = totals[0]?.spendable ?? 0;

    return {
      spendablePoints: spendable,
      lifetimePoints: totals[0]?.lifetime ?? 0,
      spentPoints: totals[0]?.spent ?? 0,
      history: history.map((row) => ({
        id: row.id,
        delta: row.delta,
        reason: row.reason,
        label: row.label,
        at: row.created_at.toISOString(),
      })),
      cashOut: {
        // Both values must be set before any of this means anything, so the
        // screen gets one flag rather than having to work it out from nulls.
        configured: rate !== null && minimum !== null,
        pointsPerDollar: rate,
        minimumPoints: minimum,
        weeklyCapCents: config?.weekly_cash_out_cap_cents ?? 0,
        usedThisWeekCents: cashedOut[0]?.cents ?? 0,
        weekStart,
        /** Null until a rate exists; never a guess. */
        availableCents: rate !== null ? Math.floor((spendable / rate) * 100) : null,
      },
    };
  });
}
