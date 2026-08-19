import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';

const RewardBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(''),
  costPoints: z.number().int().positive().max(100_000),
  category: z.string().trim().min(1).max(40),
  icon: z.string().trim().min(1).max(40),
  needsApproval: z.boolean().default(true),
  lockedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

const PreferencesBody = z.object({
  isFavorite: z.boolean().optional(),
  isPrimaryGoal: z.boolean().optional(),
});

const DenyBody = z.object({ note: z.string().trim().max(300).optional() });

/**
 * Rewards, and spending points on them.
 *
 * Redeeming debits immediately rather than reserving a balance somewhere else.
 * The screen already tells a child their points are held, and a debit is what
 * makes that true - otherwise the same 150 points could be spent on three
 * different rewards while all three sat waiting for a parent. Denying refunds
 * with a second ledger row, so the history reads as what actually happened
 * rather than the request quietly disappearing.
 */
export async function rewardRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  void opts;
  const requireChild = app.requireAuth(['child']);
  const requireParent = app.requireAuth(['parent']);
  const uuid = z.string().uuid();

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  async function balanceOf(childId: string): Promise<number> {
    const { rows } = await pool().query<{ balance: number }>(
      'SELECT coalesce(sum(delta), 0)::int AS balance FROM points_ledger WHERE child_id = $1',
      [childId],
    );
    return rows[0]?.balance ?? 0;
  }

  // --- The child's side ------------------------------------------------------

  app.get('/api/child/rewards', { onRequest: requireChild }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const db = pool();
    const childId = session.user.id;

    const { rows } = await db.query(
      `SELECT r.id, r.name, r.description, r.cost_points, r.category, r.icon,
              r.needs_approval, r.locked_until::text AS locked_until,
              coalesce(p.is_favorite, false) AS is_favorite,
              coalesce(p.is_primary_goal, false) AS is_primary_goal,
              EXISTS (
                SELECT 1 FROM reward_redemptions rr
                 WHERE rr.reward_id = r.id AND rr.child_id = $1 AND rr.status = 'requested'
              ) AS request_pending
         FROM rewards r
         LEFT JOIN child_reward_preferences p ON p.reward_id = r.id AND p.child_id = $1
        WHERE r.is_active
        ORDER BY r.cost_points`,
      [childId],
    );

    const { rows: mine } = await db.query(
      `SELECT rr.id, rr.status, rr.cost_points, rr.requested_at, rr.decided_at, rr.note,
              r.name AS reward_name
         FROM reward_redemptions rr
         JOIN rewards r ON r.id = rr.reward_id
        WHERE rr.child_id = $1
        ORDER BY rr.requested_at DESC
        LIMIT 20`,
      [childId],
    );

    return {
      spendablePoints: await balanceOf(childId),
      rewards: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        cost: row.cost_points,
        category: row.category,
        icon: row.icon,
        needsApproval: row.needs_approval,
        lockedUntil: row.locked_until,
        isFavorite: row.is_favorite,
        isPrimaryGoal: row.is_primary_goal,
        requestPending: row.request_pending,
      })),
      redemptions: mine.map((row) => ({
        id: row.id,
        rewardName: row.reward_name,
        status: row.status,
        cost: row.cost_points,
        requestedAt: row.requested_at.toISOString(),
        decidedAt: row.decided_at?.toISOString() ?? null,
        note: row.note,
      })),
    };
  });

  app.post('/api/rewards/:rewardId/redeem', { onRequest: requireChild }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { rewardId } = request.params as { rewardId: string };
    if (!uuid.safeParse(rewardId).success) throw app.httpErrors.notFound('No such reward.');

    const db = pool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{
        id: string;
        name: string;
        cost_points: number;
        is_active: boolean;
        locked_until: string | null;
      }>(
        `SELECT id, name, cost_points, is_active, locked_until::text AS locked_until
           FROM rewards WHERE id = $1 FOR UPDATE`,
        [rewardId],
      );
      const reward = rows[0];
      if (!reward || !reward.is_active) throw app.httpErrors.notFound('No such reward.');

      if (reward.locked_until) {
        const { rows: today } = await client.query<{ locked: boolean }>(
          'SELECT ($1::date >= CURRENT_DATE) AS locked',
          [reward.locked_until],
        );
        if (today[0]?.locked) throw app.httpErrors.conflict('That reward is not available yet.');
      }

      // Serialise spending per child by locking their own row first. Postgres
      // refuses FOR UPDATE on an aggregate, and locking the existing ledger rows
      // would not help anyway - the race is two requests both reading the same
      // total and then each inserting a new row. Locking the child makes the
      // second wait until the first has written its debit.
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [session.user.id]);

      const { rows: balanceRows } = await client.query<{ balance: number }>(
        `SELECT coalesce(sum(delta), 0)::int AS balance
           FROM points_ledger WHERE child_id = $1`,
        [session.user.id],
      );
      const balance = balanceRows[0]?.balance ?? 0;
      if (balance < reward.cost_points) {
        throw app.httpErrors.badRequest('Not enough points for that yet.');
      }

      const { rows: created } = await client.query<{ id: string }>(
        `INSERT INTO reward_redemptions (child_id, reward_id, cost_points, status)
         VALUES ($1, $2, $3, 'requested') RETURNING id`,
        [session.user.id, rewardId, reward.cost_points],
      );
      const redemptionId = created[0]?.id as string;

      // Debited now, not on approval. "Your points are held" has to be true.
      await client.query(
        `INSERT INTO points_ledger (child_id, delta, reason, label, reward_redemption_id, created_by)
         VALUES ($1, $2, 'reward_redeemed', $3, $4, $1)`,
        [session.user.id, -reward.cost_points, `${reward.name} requested`, redemptionId],
      );

      await client.query('COMMIT');
      return { redemption: { id: redemptionId, status: 'requested', cost: reward.cost_points } };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  /** Heart a reward, or make it the one goal the home screen shows. */
  app.put('/api/child/rewards/:rewardId/preferences', { onRequest: requireChild }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { rewardId } = request.params as { rewardId: string };
    if (!uuid.safeParse(rewardId).success) throw app.httpErrors.notFound('No such reward.');

    const body = PreferencesBody.safeParse(request.body ?? {});
    if (!body.success) throw app.httpErrors.badRequest('Nothing to change.');

    const db = pool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      if (body.data.isPrimaryGoal) {
        // A child saves toward one thing at a time; the partial unique index
        // would reject a second, so the old goal is stood down first.
        await client.query(
          'UPDATE child_reward_preferences SET is_primary_goal = false WHERE child_id = $1',
          [session.user.id],
        );
      }

      await client.query(
        `INSERT INTO child_reward_preferences (child_id, reward_id, is_favorite, is_primary_goal)
         VALUES ($1, $2, coalesce($3, false), coalesce($4, false))
         ON CONFLICT (child_id, reward_id) DO UPDATE
           SET is_favorite = coalesce($3, child_reward_preferences.is_favorite),
               is_primary_goal = coalesce($4, child_reward_preferences.is_primary_goal)`,
        [session.user.id, rewardId, body.data.isFavorite ?? null, body.data.isPrimaryGoal ?? null],
      );

      await client.query('COMMIT');
      return { ok: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // --- The parent's side -----------------------------------------------------

  app.get('/api/parent/rewards', { onRequest: requireParent }, async () => {
    const { rows } = await pool().query(
      `SELECT id, name, description, cost_points, category, icon, needs_approval,
              is_active, locked_until::text AS locked_until
         FROM rewards ORDER BY is_active DESC, cost_points`,
    );
    return {
      rewards: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        cost: row.cost_points,
        category: row.category,
        icon: row.icon,
        needsApproval: row.needs_approval,
        isActive: row.is_active,
        lockedUntil: row.locked_until,
      })),
    };
  });

  app.post('/api/parent/rewards', { onRequest: requireParent }, async (request) => {
    const body = RewardBody.safeParse(request.body);
    if (!body.success) {
      throw app.httpErrors.badRequest(body.error.issues[0]?.message ?? 'That reward is not valid.');
    }
    const r = body.data;

    const { rows } = await pool().query<{ id: string }>(
      `INSERT INTO rewards (name, description, cost_points, category, icon, needs_approval, locked_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [r.name, r.description, r.costPoints, r.category, r.icon, r.needsApproval, r.lockedUntil],
    );
    return { reward: { id: rows[0]?.id } };
  });

  app.patch('/api/parent/rewards/:rewardId', { onRequest: requireParent }, async (request) => {
    const { rewardId } = request.params as { rewardId: string };
    if (!uuid.safeParse(rewardId).success) throw app.httpErrors.notFound('No such reward.');

    const body = RewardBody.partial().safeParse(request.body);
    if (!body.success) throw app.httpErrors.badRequest('That change is not valid.');
    const r = body.data;

    const { rowCount } = await pool().query(
      `UPDATE rewards
          SET name = coalesce($2, name),
              description = coalesce($3, description),
              cost_points = coalesce($4, cost_points),
              category = coalesce($5, category),
              icon = coalesce($6, icon),
              needs_approval = coalesce($7, needs_approval),
              locked_until = $8
        WHERE id = $1`,
      [
        rewardId,
        r.name ?? null,
        r.description ?? null,
        r.costPoints ?? null,
        r.category ?? null,
        r.icon ?? null,
        r.needsApproval ?? null,
        r.lockedUntil ?? null,
      ],
    );
    if (!rowCount) throw app.httpErrors.notFound('No such reward.');
    return { ok: true };
  });

  /**
   * Retire a reward rather than delete it. Past redemptions reference it, and
   * a child's history should not lose the name of what they saved up for.
   */
  app.delete('/api/parent/rewards/:rewardId', { onRequest: requireParent }, async (request) => {
    const { rewardId } = request.params as { rewardId: string };
    if (!uuid.safeParse(rewardId).success) throw app.httpErrors.notFound('No such reward.');

    const { rowCount } = await pool().query('UPDATE rewards SET is_active = false WHERE id = $1', [
      rewardId,
    ]);
    if (!rowCount) throw app.httpErrors.notFound('No such reward.');
    return { ok: true };
  });

  app.get('/api/parent/redemptions', { onRequest: requireParent }, async () => {
    const { rows } = await pool().query(
      `SELECT rr.id, rr.status, rr.cost_points, rr.requested_at, rr.decided_at, rr.note,
              r.name AS reward_name, r.icon AS reward_icon,
              u.id AS child_id, u.display_name AS child_name
         FROM reward_redemptions rr
         JOIN rewards r ON r.id = rr.reward_id
         JOIN users u ON u.id = rr.child_id
        WHERE rr.status = 'requested'
           OR rr.decided_at > now() - interval '7 days'
        ORDER BY rr.requested_at DESC`,
    );

    const map = (row: (typeof rows)[number]) => ({
      id: row.id,
      status: row.status,
      cost: row.cost_points,
      rewardName: row.reward_name,
      rewardIcon: row.reward_icon,
      child: { id: row.child_id, displayName: row.child_name },
      requestedAt: row.requested_at.toISOString(),
      decidedAt: row.decided_at?.toISOString() ?? null,
      note: row.note,
    });

    return {
      pending: rows.filter((row) => row.status === 'requested').map(map),
      recent: rows.filter((row) => row.status !== 'requested').map(map),
    };
  });

  /** Decide one request. Denying puts the points back; approving does not move any. */
  async function decide(
    redemptionId: string,
    parentId: string,
    outcome: 'approved' | 'denied',
    note?: string,
  ) {
    const db = pool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{
        id: string;
        child_id: string;
        cost_points: number;
        status: string;
        reward_name: string;
      }>(
        `SELECT rr.id, rr.child_id, rr.cost_points, rr.status, r.name AS reward_name
           FROM reward_redemptions rr
           JOIN rewards r ON r.id = rr.reward_id
          WHERE rr.id = $1
          FOR UPDATE OF rr`,
        [redemptionId],
      );
      const redemption = rows[0];
      if (!redemption) throw app.httpErrors.notFound('No such request.');
      if (redemption.status !== 'requested') {
        throw app.httpErrors.conflict('That request has already been decided.');
      }

      await client.query(
        `UPDATE reward_redemptions
            SET status = $2, decided_at = now(), decided_by = $3, note = $4
          WHERE id = $1`,
        [redemptionId, outcome, parentId, note ?? null],
      );

      if (outcome === 'denied') {
        // Exactly what was taken, as its own row. The wallet should read as a
        // charge and a refund, not as points that quietly reappeared.
        await client.query(
          `INSERT INTO points_ledger (child_id, delta, reason, label, reward_redemption_id, created_by)
           VALUES ($1, $2, 'reward_refunded', $3, $4, $5)`,
          [
            redemption.child_id,
            redemption.cost_points,
            `${redemption.reward_name} refunded`,
            redemptionId,
            parentId,
          ],
        );
      }

      await client.query('COMMIT');
      return { status: outcome, refunded: outcome === 'denied' ? redemption.cost_points : 0 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  app.post('/api/parent/redemptions/:redemptionId/approve', { onRequest: requireParent }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();
    const { redemptionId } = request.params as { redemptionId: string };
    if (!uuid.safeParse(redemptionId).success) throw app.httpErrors.notFound('No such request.');
    return { result: await decide(redemptionId, session.user.id, 'approved') };
  });

  app.post('/api/parent/redemptions/:redemptionId/deny', { onRequest: requireParent }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();
    const { redemptionId } = request.params as { redemptionId: string };
    if (!uuid.safeParse(redemptionId).success) throw app.httpErrors.notFound('No such request.');

    const body = DenyBody.safeParse(request.body ?? {});
    return {
      result: await decide(redemptionId, session.user.id, 'denied', body.success ? body.data.note : undefined),
    };
  });
}
