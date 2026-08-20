import type { FastifyInstance } from 'fastify';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { KEEP_DAILY, KEEP_WEEKLY, mirrorAvailable, runBackup } from '../backup/service.js';

/**
 * Backups, for the System status screen.
 *
 * Reading is a parent's business; restoring is not available here at all. See
 * the note on the restore CLI: replacing every chore, point, and photo in the
 * household is an action no argument, mis-tap, or child holding an unlocked
 * phone should be able to reach, and it cannot be done sensibly by a server
 * against the database it is itself connected to.
 */
export async function backupRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;
  const requireParent = app.requireAuth(['parent']);

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  app.get('/api/parent/backups', { onRequest: requireParent }, async () => {
    const { rows } = await pool().query<{
      id: string;
      status: 'running' | 'ok' | 'failed';
      kind: 'scheduled' | 'manual';
      started_at: Date;
      finished_at: Date | null;
      bytes: string | null;
      photo_count: number | null;
      mirrored_at: Date | null;
      error: string | null;
    }>(
      `SELECT id, status, kind, started_at, finished_at, bytes, photo_count, mirrored_at, error
         FROM backups
        ORDER BY started_at DESC
        LIMIT 30`,
    );

    const backups = rows.map((row) => ({
      id: row.id,
      status: row.status,
      kind: row.kind,
      at: row.started_at.toISOString(),
      finishedAt: row.finished_at?.toISOString() ?? null,
      bytes: row.bytes === null ? null : Number(row.bytes),
      photoCount: row.photo_count,
      mirrored: row.mirrored_at !== null,
      error: row.error,
    }));

    const lastGood = backups.find((entry) => entry.status === 'ok') ?? null;

    return {
      // Deliberately reported even when it is false. A household that thinks it
      // has an off-laptop copy and does not is worse off than one that knows
      // it does not, because the first will not go looking for the drive.
      mirrorConfigured: Boolean(env.BACKUP_MIRROR_DIR),
      mirrorConnected: await mirrorAvailable(env),
      retention: { daily: KEEP_DAILY, weekly: KEEP_WEEKLY },
      lastGood,
      backups,
    };
  });

  app.post('/api/parent/backups', { onRequest: requireParent }, async (request) => {
    try {
      const result = await runBackup(pool(), env, request.log, 'manual');
      return {
        backup: {
          id: result.id,
          bytes: result.bytes,
          photoCount: result.photoCount,
          mirrored: result.mirroredTo !== null,
        },
      };
    } catch (error) {
      request.log.error({ err: error }, 'manual backup failed');
      // The failure is already recorded against the row, so the screen will
      // show it either way; this is the immediate answer to the button press.
      throw app.httpErrors.internalServerError(
        'The backup did not finish. System status has the reason.',
      );
    }
  });
}
