import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { notify } from '../notifications/service.js';
import { householdToday, householdWeekStart } from '../time.js';

/**
 * Turning points into pocket money.
 *
 * Everything around this was built and the middle never was. The rate, the
 * minimum and the weekly cap are configured, stored and enforced; the wallet
 * reads them and draws a meter; the table has a status enum with four states
 * and an index for the pending queue. What did not exist was any way to ask.
 *
 * That was invisible while the rate was unset, because the wallet showed its
 * "cash out is turned off" panel and told the truth. The moment an owner set a
 * rate it became a screen explaining the exchange to a child and offering them
 * nothing to press.
 *
 * Points are debited on the request, not on the decision, exactly as a reward
 * redemption is: "your points are held" has to be true, or two requests spend
 * the same balance. A denial refunds with a second ledger row, because the
 * ledger is append-only and a correction is another row.
 */
export async function cashOutRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;
  const requireChild = app.requireAuth(['child']);
  const requireParent = app.requireAuth(['parent']);

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  const RequestBody = z.object({ amountCents: z.number().int().positive().max(100_000) });
  const DecisionBody = z.object({ note: z.string().trim().max(280).optional() });
  const uuid = z.string().uuid();

  app.post('/api/child/cash-out', { onRequest: requireChild }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { amountCents } = RequestBody.parse(request.body);
    const childId = session.user.id;
    const weekStart = householdWeekStart(householdToday(env.HOUSEHOLD_TZ));

    const db = pool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: settings } = await client.query<{
        points_per_dollar: number | null;
        minimum_cash_out_points: number | null;
        weekly_cash_out_cap_cents: number;
      }>(
        `SELECT points_per_dollar, minimum_cash_out_points, weekly_cash_out_cap_cents
           FROM household_settings FOR UPDATE`,
      );
      const rate = settings[0]?.points_per_dollar ?? null;
      const minimum = settings[0]?.minimum_cash_out_points ?? null;
      const cap = settings[0]?.weekly_cash_out_cap_cents ?? 0;

      // The pair is the setting; either alone is a half-finished thought.
      if (rate === null || minimum === null) {
        throw app.httpErrors.badRequest('Cash out is turned off until a parent sets the rate.');
      }

      const points = Math.round((amountCents / 100) * rate);
      if (points <= 0) throw app.httpErrors.badRequest('That is not enough to cash out.');

      const { rows: balanceRows } = await client.query<{ balance: number }>(
        `SELECT coalesce(sum(delta), 0)::int AS balance
           FROM points_ledger WHERE child_id = $1`,
        [childId],
      );
      const balance = balanceRows[0]?.balance ?? 0;

      if (balance < minimum) {
        throw app.httpErrors.badRequest(`You need at least ${minimum} points to cash out.`);
      }
      if (balance < points) throw app.httpErrors.badRequest('Not enough points for that yet.');

      // The cap is the household's, per week, and a denied request never spent
      // any of it. Locked with the settings row above so two requests sent at
      // once cannot both find room under it.
      const { rows: used } = await client.query<{ cents: number }>(
        `SELECT coalesce(sum(amount_cents), 0)::int AS cents
           FROM cash_out_requests
          WHERE child_id = $1 AND week_start = $2::date AND status <> 'denied'`,
        [childId, weekStart],
      );
      const remaining = cap - (used[0]?.cents ?? 0);
      if (amountCents > remaining) {
        throw app.httpErrors.badRequest(
          remaining <= 0
            ? 'That is the whole of this week already. Try again next week.'
            : `Only $${(remaining / 100).toFixed(2)} left of this week's limit.`,
        );
      }

      const { rows: created } = await client.query<{ id: string }>(
        `INSERT INTO cash_out_requests (child_id, points, amount_cents, week_start, status)
         VALUES ($1, $2, $3, $4::date, 'requested') RETURNING id`,
        [childId, points, amountCents, weekStart],
      );
      const id = created[0]?.id as string;

      await client.query(
        `INSERT INTO points_ledger (child_id, delta, reason, label, created_by)
         VALUES ($1, $2, 'cash_out', $3, $1)`,
        [childId, -points, `Cash out $${(amountCents / 100).toFixed(2)} requested`],
      );

      await client.query('COMMIT');
      return { request: { id, points, amountCents, status: 'requested' as const } };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  /** What a child has asked for, newest first. */
  app.get('/api/child/cash-out', { onRequest: requireChild }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { rows } = await pool().query<{
      id: string;
      points: number;
      amount_cents: number;
      status: string;
      requested_at: Date;
      note: string | null;
    }>(
      `SELECT id, points, amount_cents, status, requested_at, note
         FROM cash_out_requests WHERE child_id = $1
        ORDER BY requested_at DESC LIMIT 20`,
      [session.user.id],
    );

    return {
      requests: rows.map((row) => ({
        id: row.id,
        points: row.points,
        amountCents: row.amount_cents,
        status: row.status,
        at: row.requested_at.toISOString(),
        note: row.note,
      })),
    };
  });

  /** The parent queue: everything still waiting, and anything approved but not handed over. */
  app.get('/api/parent/cash-out', { onRequest: requireParent }, async () => {
    const { rows } = await pool().query<{
      id: string;
      points: number;
      amount_cents: number;
      status: string;
      requested_at: Date;
      child_id: string;
      display_name: string;
    }>(
      `SELECT c.id, c.points, c.amount_cents, c.status, c.requested_at,
              u.id AS child_id, u.display_name
         FROM cash_out_requests c
         JOIN users u ON u.id = c.child_id
        WHERE c.status IN ('requested', 'approved')
        ORDER BY c.requested_at`,
    );

    return {
      requests: rows.map((row) => ({
        id: row.id,
        points: row.points,
        amountCents: row.amount_cents,
        status: row.status,
        at: row.requested_at.toISOString(),
        child: { id: row.child_id, displayName: row.display_name },
      })),
    };
  });

  /**
   * Approving says the money is owed. Marking it paid says it changed hands.
   *
   * Two steps rather than one because they happen at different moments - a
   * parent agrees on Tuesday and finds cash on Saturday - and a queue that
   * forgets which is which is how a child gets paid twice or not at all.
   */
  for (const [action, next] of [
    ['approve', 'approved'],
    ['paid', 'paid'],
  ] as const) {
    app.post(`/api/parent/cash-out/:id/${action}`, { onRequest: requireParent }, async (request) => {
      const session = request.session;
      if (!session) throw app.httpErrors.unauthorized();

      const { id } = request.params as { id: string };
      if (!uuid.safeParse(id).success) throw app.httpErrors.notFound('No such request.');

      const from = action === 'approve' ? 'requested' : 'approved';
      const { rows } = await pool().query<{ child_id: string; amount_cents: number }>(
        `UPDATE cash_out_requests
            SET status = $1, decided_at = now(), decided_by = $2
          WHERE id = $3 AND status = $4
        RETURNING child_id, amount_cents`,
        [next, session.user.id, id, from],
      );

      const row = rows[0];
      if (!row) throw app.httpErrors.conflict('That request has already been dealt with.');

      await notify(pool(), {
        userId: row.child_id,
        kind: 'reward_decided',
        title: action === 'approve' ? 'Cash out approved' : 'Cash out paid',
        body:
          action === 'approve'
            ? `$${(row.amount_cents / 100).toFixed(2)} is coming your way.`
            : `$${(row.amount_cents / 100).toFixed(2)} has been handed over.`,
        tone: 'done',
        deepLink: '#/child/wallet',
      });

      return { ok: true as const };
    });
  }

  /** Denying refunds, because the points were taken when the child asked. */
  app.post('/api/parent/cash-out/:id/deny', { onRequest: requireParent }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { id } = request.params as { id: string };
    if (!uuid.safeParse(id).success) throw app.httpErrors.notFound('No such request.');
    const { note } = DecisionBody.parse(request.body ?? {});

    const db = pool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{
        child_id: string;
        points: number;
        amount_cents: number;
      }>(
        `UPDATE cash_out_requests
            SET status = 'denied', decided_at = now(), decided_by = $1, note = $2
          WHERE id = $3 AND status IN ('requested', 'approved')
        RETURNING child_id, points, amount_cents`,
        [session.user.id, note ?? null, id],
      );

      const row = rows[0];
      if (!row) throw app.httpErrors.conflict('That request has already been dealt with.');

      await client.query(
        `INSERT INTO points_ledger (child_id, delta, reason, label, created_by)
         VALUES ($1, $2, 'cash_out', $3, $4)`,
        [
          row.child_id,
          row.points,
          `Cash out $${(row.amount_cents / 100).toFixed(2)} returned`,
          session.user.id,
        ],
      );

      await client.query('COMMIT');

      await notify(db, {
        userId: row.child_id,
        kind: 'reward_decided',
        title: 'Cash out not this time',
        // The note is the whole point of asking for one: a child told no and
        // not told why learns nothing except that asking is a gamble.
        body: note?.trim() ? note.trim() : 'Your points have been put back.',
        tone: 'late',
        deepLink: '#/child/wallet',
      });

      return { ok: true as const };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}
