import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { choreForChild } from '../chores/queries.js';
import {
  MAX_PHOTO_BYTES,
  MIME_FOR,
  deletePhoto,
  detectFormat,
  formatFromPath,
  resolveStoredPath,
  storePhoto,
} from '../photos/storage.js';

/** Statuses a child is still allowed to attach proof to. */
const OPEN_STATUSES = ['not_started', 'in_progress', 'rejected'] as const;

/** Enough for "the counter and the floor" without filling the laptop's disk. */
const MAX_PHOTOS_PER_CHORE = 5;

export async function photoRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;
  const storageRoot = resolve(env.PHOTO_STORAGE_DIR);

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  const uuid = z.string().uuid();

  /**
   * Attach a photo to a chore.
   *
   * The client downscales before sending; see the frontend camera. The limit
   * here is a backstop against a phone that ignores that, not the expected size.
   */
  app.post(
    '/api/chores/:instanceId/photos',
    { onRequest: app.requireAuth(['child']) },
    async (request) => {
      const session = request.session;
      if (!session) throw app.httpErrors.unauthorized();

      const { instanceId } = request.params as { instanceId: string };
      if (!uuid.safeParse(instanceId).success) throw app.httpErrors.notFound('No such chore.');

      const db = pool();
      const { rows } = await db.query<{ chore_date: string; status: string; photo_count: number }>(
        `SELECT ci.chore_date::text AS chore_date, ci.status,
                (SELECT count(*)::int FROM chore_photos p WHERE p.chore_instance_id = ci.id) AS photo_count
           FROM chore_instances ci
          WHERE ci.id = $1 AND ci.assigned_to = $2`,
        [instanceId, session.user.id],
      );
      const chore = rows[0];
      if (!chore) throw app.httpErrors.notFound('No such chore.');

      if (!OPEN_STATUSES.includes(chore.status as (typeof OPEN_STATUSES)[number])) {
        throw app.httpErrors.conflict('That chore is not open for changes.');
      }
      if (chore.photo_count >= MAX_PHOTOS_PER_CHORE) {
        throw app.httpErrors.conflict('That chore already has five photos.');
      }

      const file = await request.file({ limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });
      if (!file) throw app.httpErrors.badRequest('No photo was sent.');

      const bytes = await file.toBuffer();
      if (file.file.truncated) {
        throw app.httpErrors.payloadTooLarge('That photo is too large.');
      }
      // Sniffed, not trusted. file.mimetype is whatever the browser claimed.
      if (!detectFormat(bytes)) {
        throw app.httpErrors.unsupportedMediaType('That file is not an image.');
      }

      const stored = await storePhoto(storageRoot, bytes, chore.chore_date);

      try {
        const { rows: saved } = await db.query<{ id: string; created_at: Date }>(
          `INSERT INTO chore_photos (chore_instance_id, uploaded_by, file_path, byte_size, sha256)
           VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
          [instanceId, session.user.id, stored.filePath, stored.byteSize, stored.sha256],
        );

        return {
          photo: {
            id: saved[0]?.id,
            byteSize: stored.byteSize,
            createdAt: saved[0]?.created_at.toISOString(),
          },
        };
      } catch (error) {
        // Do not leave a file on disk that nothing points at.
        await deletePhoto(storageRoot, stored.filePath);
        throw error;
      }
    },
  );

  /**
   * Serve a photo.
   *
   * Authenticated, and scoped: a child sees only their own proof, a parent sees
   * any. These are pictures of the inside of a house taken by children, so they
   * are never served from a static directory.
   */
  app.get('/api/photos/:photoId', { onRequest: app.requireAuth() }, async (request, reply) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { photoId } = request.params as { photoId: string };
    if (!uuid.safeParse(photoId).success) throw app.httpErrors.notFound('No such photo.');

    const db = pool();
    const { rows } = await db.query<{ file_path: string; first_viewed_at: Date | null }>(
      `SELECT p.file_path, p.first_viewed_at
         FROM chore_photos p
         JOIN chore_instances ci ON ci.id = p.chore_instance_id
        WHERE p.id = $1
          AND ($2 = 'parent' OR ci.assigned_to = $3)`,
      [photoId, session.user.role, session.user.id],
    );
    const photo = rows[0];
    if (!photo) throw app.httpErrors.notFound('No such photo.');

    // The approval queue refuses "Approve all" until every photo has actually
    // been looked at, so the first parent to open one is recorded here - the
    // only place that can know it happened.
    if (session.user.role === 'parent' && !photo.first_viewed_at) {
      await db.query(
        `UPDATE chore_photos SET first_viewed_at = now(), first_viewed_by = $2
          WHERE id = $1 AND first_viewed_at IS NULL`,
        [photoId, session.user.id],
      );
    }

    const absolute = resolveStoredPath(storageRoot, photo.file_path);
    let size: number;
    try {
      size = (await stat(absolute)).size;
    } catch {
      // The row outlived its file. Say not-found rather than 500.
      request.log.error({ photoId, path: photo.file_path }, 'photo row has no file on disk');
      throw app.httpErrors.notFound('That photo is missing.');
    }

    // Content type comes from the stored extension, which this server chose from
    // the sniffed bytes - never from anything a client supplied.
    return reply
      .header('Content-Type', MIME_FOR[formatFromPath(photo.file_path)])
      .header('Content-Length', size)
      .header('Content-Disposition', 'inline')
      // Household data behind a tunnel: no shared cache should ever hold it.
      .header('Cache-Control', 'private, max-age=3600')
      .header('X-Content-Type-Options', 'nosniff')
      .send(createReadStream(absolute));
  });

  /**
   * Submit a chore for a parent to review.
   *
   * Every step ticked and at least one photo, both enforced here. The
   * specification requires photo proof, and a client-side check is a courtesy
   * to the child rather than the rule.
   */
  app.post(
    '/api/chores/:instanceId/submit',
    { onRequest: app.requireAuth(['child']) },
    async (request) => {
      const session = request.session;
      if (!session) throw app.httpErrors.unauthorized();

      const { instanceId } = request.params as { instanceId: string };
      if (!uuid.safeParse(instanceId).success) throw app.httpErrors.notFound('No such chore.');

      const db = pool();
      const { rows } = await db.query<{
        status: string;
        total: number;
        done: number;
        photos: number;
      }>(
        `SELECT ci.status,
                (SELECT count(*)::int FROM chore_instance_subtasks s
                  WHERE s.chore_instance_id = ci.id) AS total,
                (SELECT count(*)::int FROM chore_instance_subtasks s
                  WHERE s.chore_instance_id = ci.id AND s.done) AS done,
                (SELECT count(*)::int FROM chore_photos p
                  WHERE p.chore_instance_id = ci.id) AS photos
           FROM chore_instances ci
          WHERE ci.id = $1 AND ci.assigned_to = $2`,
        [instanceId, session.user.id],
      );
      const chore = rows[0];
      if (!chore) throw app.httpErrors.notFound('No such chore.');

      if (!OPEN_STATUSES.includes(chore.status as (typeof OPEN_STATUSES)[number])) {
        throw app.httpErrors.conflict('That chore has already been sent for review.');
      }
      if (chore.total > 0 && chore.done < chore.total) {
        throw app.httpErrors.badRequest('Finish every step before sending this for review.');
      }
      if (chore.photos === 0) {
        throw app.httpErrors.badRequest('Add a photo of your finished work.');
      }

      await db.query(
        `UPDATE chore_instances
            SET status = 'submitted', submitted_at = now(), rejection_note = NULL
          WHERE id = $1 AND assigned_to = $2`,
        [instanceId, session.user.id],
      );

      const updated = await choreForChild(db, session.user.id, instanceId);
      if (!updated) throw app.httpErrors.notFound('No such chore.');
      return { chore: updated };
    },
  );
}
