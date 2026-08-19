import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { householdToday, isHouseholdDate } from '../time.js';
import { BonusError, UNFINISHED, claimBonus, releaseBonus, releaseExpiredClaims } from '../chores/bonus.js';

const PostBody = z.object({
  /** Reuse an existing bonus definition, or supply the fields for a new one. */
  choreDefinitionId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  icon: z.string().trim().min(1).max(40).optional(),
  points: z.number().int().positive().max(10_000).optional(),
  category: z.string().trim().max(40).nullable().optional(),
  subtasks: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  /** Household date it belongs to. Defaults to today. */
  choreDate: z.string().optional(),
  /** ISO 8601. Null means it stays on the board until a parent removes it. */
  expiresAt: z.string().datetime().nullable().default(null),
});

/** Turns a BonusError into the right HTTP answer. */
function asHttp(app: FastifyInstance, error: unknown): never {
  if (error instanceof BonusError) {
    if (error.kind === 'not_found' || error.kind === 'not_yours') {
      throw app.httpErrors.notFound(error.message);
    }
    throw app.httpErrors.conflict(error.message);
  }
  throw error;
}

export async function bonusRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;
  const requireChild = app.requireAuth(['child']);
  const requireParent = app.requireAuth(['parent']);
  const uuid = z.string().uuid();

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  app.post('/api/bonus/:instanceId/claim', { onRequest: requireChild }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { instanceId } = request.params as { instanceId: string };
    if (!uuid.safeParse(instanceId).success) throw app.httpErrors.notFound('No such bonus chore.');

    const db = pool();
    // Anything that lapsed goes back on the board before this claim is judged,
    // so a chore whose deadline passed a minute ago is claimable by anyone.
    await releaseExpiredClaims(db);

    try {
      await claimBonus(db, session.user.id, instanceId);
    } catch (error) {
      asHttp(app, error);
    }
    return { ok: true };
  });

  app.post('/api/bonus/:instanceId/release', { onRequest: requireChild }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { instanceId } = request.params as { instanceId: string };
    if (!uuid.safeParse(instanceId).success) throw app.httpErrors.notFound('No such bonus chore.');

    try {
      await releaseBonus(pool(), session.user.id, instanceId);
    } catch (error) {
      asHttp(app, error);
    }
    return { ok: true };
  });

  /** The board as a parent sees it: everything posted, claimed or not. */
  app.get('/api/parent/bonus', { onRequest: requireParent }, async () => {
    const db = pool();
    await releaseExpiredClaims(db);

    const { rows } = await db.query(
      `SELECT ci.id, ci.chore_date::text AS chore_date, ci.status, ci.points_value,
              ci.expires_at, ci.claimed_at,
              d.id AS definition_id, d.name, d.icon, d.category,
              u.display_name AS claimed_by,
              (SELECT count(*)::int FROM chore_instance_subtasks s
                WHERE s.chore_instance_id = ci.id) AS subtask_count
         FROM chore_instances ci
         JOIN chore_definitions d ON d.id = ci.chore_definition_id
         LEFT JOIN users u ON u.id = ci.assigned_to
        WHERE d.kind = 'bonus'
          AND ci.chore_date >= CURRENT_DATE - 7
        ORDER BY ci.expires_at NULLS LAST, ci.points_value DESC`,
    );

    return {
      bonus: rows.map((row) => ({
        id: row.id,
        definitionId: row.definition_id,
        name: row.name,
        icon: row.icon,
        category: row.category,
        points: row.points_value,
        choreDate: row.chore_date,
        status: row.status,
        expiresAt: row.expires_at?.toISOString() ?? null,
        claimedAt: row.claimed_at?.toISOString() ?? null,
        claimedBy: row.claimed_by,
        subtaskCount: row.subtask_count,
      })),
    };
  });

  /** Post a bonus chore to the board. */
  app.post('/api/parent/bonus', { onRequest: requireParent }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const body = PostBody.safeParse(request.body);
    if (!body.success) {
      throw app.httpErrors.badRequest('That bonus chore is not valid.');
    }
    const input = body.data;

    const choreDate = input.choreDate ?? householdToday(env.HOUSEHOLD_TZ);
    if (!isHouseholdDate(choreDate)) {
      throw app.httpErrors.badRequest('date must be a calendar date, as YYYY-MM-DD.');
    }

    const db = pool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      let definitionId = input.choreDefinitionId;
      let points = input.points;

      if (definitionId) {
        // Reposting something already on the list; take its current price
        // unless this posting overrides it.
        const { rows } = await client.query<{ points: number; kind: string }>(
          'SELECT points, kind FROM chore_definitions WHERE id = $1 AND is_active',
          [definitionId],
        );
        const existing = rows[0];
        if (!existing || existing.kind !== 'bonus') {
          throw app.httpErrors.notFound('No such bonus chore.');
        }
        points ??= existing.points;
      } else {
        if (!input.name || !input.icon || !input.points) {
          throw app.httpErrors.badRequest('A new bonus chore needs a name, an icon, and points.');
        }
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO chore_definitions (name, icon, kind, points, category, created_by)
           VALUES ($1, $2, 'bonus', $3, $4, $5) RETURNING id`,
          [input.name, input.icon, input.points, input.category ?? null, session.user.id],
        );
        definitionId = rows[0]?.id as string;
        points = input.points;

        for (const [index, title] of input.subtasks.entries()) {
          await client.query(
            `INSERT INTO chore_subtask_templates (chore_definition_id, position, title)
             VALUES ($1, $2, $3)`,
            [definitionId, index, title],
          );
        }
      }

      // Unclaimed: assigned_to stays null until a child takes it. The partial
      // unique index only covers assigned rows, so several postings of the same
      // bonus on one day are allowed.
      // The window is stored, not inferred from the deadline, so a chore that
      // lapses and returns gets the same length again rather than a growing one.
      const windowMinutes = input.expiresAt
        ? Math.max(1, Math.round((new Date(input.expiresAt).getTime() - Date.now()) / 60_000))
        : null;

      const { rows: created } = await client.query<{ id: string }>(
        `INSERT INTO chore_instances
           (chore_definition_id, assigned_to, chore_date, points_value, expires_at,
            claim_window_minutes)
         VALUES ($1, NULL, $2::date, $3, $4, $5) RETURNING id`,
        [definitionId, choreDate, points, input.expiresAt, windowMinutes],
      );
      const instanceId = created[0]?.id as string;

      await client.query(
        `INSERT INTO chore_instance_subtasks
           (chore_instance_id, template_id, position, title, instruction)
         SELECT $1, t.id, t.position, t.title, t.instruction
           FROM chore_subtask_templates t
          WHERE t.chore_definition_id = $2`,
        [instanceId, definitionId],
      );

      await client.query('COMMIT');
      return { bonus: { id: instanceId, definitionId } };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  /**
   * Take a bonus chore off the board.
   *
   * Refused once a child has claimed it and started work - pulling it then would
   * mean a child sweeping the garage for points that vanished mid-task.
   */
  app.delete('/api/parent/bonus/:instanceId', { onRequest: requireParent }, async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    if (!uuid.safeParse(instanceId).success) throw app.httpErrors.notFound('No such bonus chore.');

    const { rows } = await pool().query<{ assigned_to: string | null; status: string }>(
      'SELECT assigned_to, status FROM chore_instances WHERE id = $1',
      [instanceId],
    );
    const bonus = rows[0];
    if (!bonus) throw app.httpErrors.notFound('No such bonus chore.');

    if (bonus.assigned_to && UNFINISHED.includes(bonus.status as (typeof UNFINISHED)[number])) {
      throw app.httpErrors.conflict('Someone is working on that one. Let them finish it.');
    }
    if (!UNFINISHED.includes(bonus.status as (typeof UNFINISHED)[number])) {
      throw app.httpErrors.conflict('That one has already been sent for review.');
    }

    await pool().query('DELETE FROM chore_instances WHERE id = $1', [instanceId]);
    return { ok: true };
  });
}
