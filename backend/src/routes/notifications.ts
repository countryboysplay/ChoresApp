import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';

/**
 * Everyone's own inbox.
 *
 * Scoped to the session in the query rather than checked afterwards, so a
 * guessed id cannot reach somebody else's notification.
 */
export async function notificationRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  void opts;
  const requireAnyone = app.requireAuth();

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  app.get('/api/notifications', { onRequest: requireAnyone }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { rows } = await pool().query<{
      id: string;
      kind: string;
      title: string;
      body: string;
      tone: string;
      deep_link: string | null;
      read_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, kind, title, body, tone, deep_link, read_at, created_at
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [session.user.id],
    );

    return {
      unread: rows.filter((row) => row.read_at === null).length,
      notifications: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        tone: row.tone,
        deepLink: row.deep_link,
        read: row.read_at !== null,
        at: row.created_at.toISOString(),
      })),
    };
  });

  app.post('/api/notifications/:id/read', { onRequest: requireAnyone }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { id } = request.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) {
      throw app.httpErrors.notFound('No such notification.');
    }

    const { rowCount } = await pool().query(
      `UPDATE notifications SET read_at = coalesce(read_at, now())
        WHERE id = $1 AND user_id = $2`,
      [id, session.user.id],
    );
    if (!rowCount) throw app.httpErrors.notFound('No such notification.');
    return { ok: true };
  });

  app.post('/api/notifications/read-all', { onRequest: requireAnyone }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { rowCount } = await pool().query(
      'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
      [session.user.id],
    );
    return { marked: rowCount ?? 0 };
  });
}
