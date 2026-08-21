import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { householdToday } from '../time.js';
import { notify } from '../notifications/service.js';
import { syncAchievements } from '../achievements/service.js';

const RejectBody = z.object({
  note: z.string().trim().min(1, 'A note is required.').max(500),
});

/**
 * Parent review.
 *
 * This is the first code in the project that writes to `points_ledger`, and the
 * only code that moves a chore out of `submitted`.
 */
export async function approvalRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;
  const requireParent = app.requireAuth(['parent']);

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  const uuid = z.string().uuid();

  /** Everything waiting for review, plus what was reviewed today. */
  app.get('/api/parent/approvals', { onRequest: requireParent }, async () => {
    const db = pool();
    const today = householdToday(env.HOUSEHOLD_TZ);

    const { rows } = await db.query(
      `SELECT ci.id,
              ci.status,
              ci.chore_date::text AS chore_date,
              ci.submitted_at,
              ci.reviewed_at,
              ci.points_value,
              ci.points_awarded,
              ci.submitted_punctual,
              ci.rejection_note,
              d.name AS chore_name,
              d.icon AS chore_icon,
              d.kind AS chore_kind,
              u.id AS child_id,
              u.display_name AS child_name,
              u.avatar AS child_avatar,
              (SELECT count(*)::int FROM chore_instance_subtasks s
                WHERE s.chore_instance_id = ci.id) AS subtasks_total,
              (SELECT count(*)::int FROM chore_instance_subtasks s
                WHERE s.chore_instance_id = ci.id AND s.done) AS subtasks_done,
              coalesce(
                (SELECT json_agg(json_build_object('id', p.id, 'viewed', p.first_viewed_at IS NOT NULL)
                                 ORDER BY p.created_at)
                   FROM chore_photos p WHERE p.chore_instance_id = ci.id),
                '[]'::json
              ) AS photos
         FROM chore_instances ci
         JOIN chore_definitions d ON d.id = ci.chore_definition_id
         JOIN users u ON u.id = ci.assigned_to
        WHERE ci.status = 'submitted'
           OR (ci.reviewed_at IS NOT NULL AND ci.chore_date = $1::date)
        ORDER BY ci.submitted_at`,
      [today],
    );

    const map = (row: (typeof rows)[number]) => ({
      id: row.id,
      status: row.status,
      choreDate: row.chore_date,
      choreName: row.chore_name,
      choreIcon: row.chore_icon,
      choreKind: row.chore_kind,
      child: { id: row.child_id, displayName: row.child_name, avatar: row.child_avatar },
      submittedAt: row.submitted_at?.toISOString() ?? null,
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      pointsValue: row.points_value,
      pointsAwarded: row.points_awarded,
      punctual: row.submitted_punctual,
      rejectionNote: row.rejection_note,
      subtasksTotal: row.subtasks_total,
      subtasksDone: row.subtasks_done,
      photos: row.photos as { id: string; viewed: boolean }[],
    });

    return {
      pending: rows.filter((row) => row.status === 'submitted').map(map),
      reviewed: rows.filter((row) => row.status !== 'submitted').map(map),
    };
  });

  /** One submission, with its checklist, for the review screen. */
  app.get('/api/parent/approvals/:instanceId', { onRequest: requireParent }, async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    if (!uuid.safeParse(instanceId).success) throw app.httpErrors.notFound('No such submission.');

    const db = pool();
    const { rows } = await db.query(
      `SELECT ci.id, ci.status, ci.chore_date::text AS chore_date, ci.submitted_at,
              ci.points_value, ci.submitted_punctual, ci.rejection_note,
              d.name AS chore_name, d.icon AS chore_icon,
              u.id AS child_id, u.display_name AS child_name, u.avatar AS child_avatar,
              (SELECT settings.punctuality_bonus_points FROM household_settings settings) AS bonus_points,
              coalesce(
                (SELECT json_agg(json_build_object(
                          'id', s.id, 'title', s.title, 'instruction', s.instruction, 'done', s.done)
                        ORDER BY s.position)
                   FROM chore_instance_subtasks s WHERE s.chore_instance_id = ci.id),
                '[]'::json
              ) AS subtasks,
              coalesce(
                (SELECT json_agg(json_build_object('id', p.id, 'viewed', p.first_viewed_at IS NOT NULL)
                                 ORDER BY p.created_at)
                   FROM chore_photos p WHERE p.chore_instance_id = ci.id),
                '[]'::json
              ) AS photos
         FROM chore_instances ci
         JOIN chore_definitions d ON d.id = ci.chore_definition_id
         JOIN users u ON u.id = ci.assigned_to
        WHERE ci.id = $1`,
      [instanceId],
    );

    const row = rows[0];
    if (!row) throw app.httpErrors.notFound('No such submission.');

    return {
      submission: {
        id: row.id,
        status: row.status,
        choreDate: row.chore_date,
        choreName: row.chore_name,
        choreIcon: row.chore_icon,
        child: { id: row.child_id, displayName: row.child_name, avatar: row.child_avatar },
        submittedAt: row.submitted_at?.toISOString() ?? null,
        pointsValue: row.points_value,
        punctual: row.submitted_punctual,
        bonusPoints: row.submitted_punctual ? row.bonus_points : 0,
        rejectionNote: row.rejection_note,
        subtasks: row.subtasks,
        photos: row.photos as { id: string; viewed: boolean }[],
      },
    };
  });

  /**
   * Approve one chore and pay for it.
   *
   * All of it in one transaction: the status, the award, and the ledger rows
   * that explain the award. A partial success here would be points with no
   * history, or history with no points.
   */
  async function approveOne(
    parentId: string,
    instanceId: string,
  ): Promise<{ awarded: number; bonus: number }> {
    const db = pool();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // FOR UPDATE so two parents tapping Approve at the same moment queue up
      // rather than both seeing 'submitted' and both paying.
      const { rows } = await client.query<{
        id: string;
        status: string;
        points_value: number;
        submitted_punctual: boolean | null;
        child_id: string;
        chore_name: string;
        unviewed: number;
        bonus_points: number;
      }>(
        `SELECT ci.id, ci.status, ci.points_value, ci.submitted_punctual,
                ci.assigned_to AS child_id, d.name AS chore_name,
                (SELECT count(*)::int FROM chore_photos p
                  WHERE p.chore_instance_id = ci.id AND p.first_viewed_at IS NULL) AS unviewed,
                (SELECT punctuality_bonus_points FROM household_settings) AS bonus_points
           FROM chore_instances ci
           JOIN chore_definitions d ON d.id = ci.chore_definition_id
          WHERE ci.id = $1
          FOR UPDATE OF ci`,
        [instanceId],
      );

      const chore = rows[0];
      if (!chore) throw app.httpErrors.notFound('No such submission.');
      if (chore.status !== 'submitted') {
        throw app.httpErrors.conflict('That chore is not waiting for review.');
      }
      // The specification's guard against rubber-stamping. The review screen
      // loads the photo, which marks it seen, so this only bites a request that
      // skipped looking.
      if (chore.unviewed > 0) {
        throw app.httpErrors.conflict('Open the photo before approving this chore.');
      }

      const bonus = chore.submitted_punctual ? chore.bonus_points : 0;
      const total = chore.points_value + bonus;

      await client.query(
        `UPDATE chore_instances
            SET status = 'approved', points_awarded = $2, reviewed_at = now(), reviewed_by = $3
          WHERE id = $1`,
        [instanceId, total, parentId],
      );

      await client.query(
        `INSERT INTO points_ledger (child_id, delta, reason, label, chore_instance_id, created_by)
         VALUES ($1, $2, 'chore_approved', $3, $4, $5)`,
        [chore.child_id, chore.points_value, `${chore.chore_name} approved`, instanceId, parentId],
      );

      if (bonus > 0) {
        // A separate row, not folded into the award, so the wallet can show why
        // one approved chore paid more than another.
        await client.query(
          `INSERT INTO points_ledger (child_id, delta, reason, label, chore_instance_id, created_by)
           VALUES ($1, $2, 'punctuality_bonus', 'Punctuality bonus', $3, $4)`,
          [chore.child_id, bonus, instanceId, parentId],
        );
      }

      // Inside the transaction: a child told they were paid, when the payment
      // rolled back, is worse than no notification at all.
      await notify(client, {
        userId: chore.child_id,
        kind: 'chore_approved',
        title: `${chore.chore_name} approved`,
        body: bonus > 0
          ? `${total} points, including ${bonus} for being on time.`
          : `${total} points added to your wallet.`,
        tone: 'done',
        deepLink: '#/child/wallet',
        choreInstanceId: instanceId,
      });

      await client.query('COMMIT');

      /*
       * After the commit, and never allowed to undo it.
       *
       * A badge is a consequence of the approval, not part of it: the points
       * are the thing that had to be atomic. Recomputing inside the transaction
       * would put seventeen more statements between a parent's tap and the row
       * being safe, and a rule that threw would roll back a payment a child had
       * already been told about.
       *
       * Reconciled rather than incremented, so nothing is lost if this half
       * fails - the next look at the badges works it out again. That is why it
       * is safe to swallow the error and only log it.
       */
      try {
        const { newlyEarned } = await syncAchievements(
          db,
          chore.child_id,
          householdToday(env.HOUSEHOLD_TZ),
        );
        for (const badge of newlyEarned) {
          await notify(db, {
            userId: chore.child_id,
            kind: 'general',
            title: `Badge earned: ${badge.name}`,
            body: badge.description,
            tone: 'done',
            deepLink: '#/child/achievements',
          });
        }
      } catch (error) {
        app.log.warn({ err: error }, 'could not update achievements after approval');
      }

      return { awarded: chore.points_value, bonus };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  app.post('/api/parent/approvals/:instanceId/approve', { onRequest: requireParent }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { instanceId } = request.params as { instanceId: string };
    if (!uuid.safeParse(instanceId).success) throw app.httpErrors.notFound('No such submission.');

    return { result: await approveOne(session.user.id, instanceId) };
  });

  /**
   * Approve everything currently waiting.
   *
   * Each chore is its own transaction, so one problem does not roll back the
   * approvals that already succeeded - the parent sees exactly what went
   * through and what did not.
   */
  app.post('/api/parent/approvals/approve-all', { onRequest: requireParent }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const db = pool();
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM chore_instances WHERE status = 'submitted' ORDER BY submitted_at`,
    );

    const approved: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const row of rows) {
      try {
        await approveOne(session.user.id, row.id);
        approved.push(row.id);
      } catch (error) {
        const message =
          typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message: unknown }).message)
            : 'Could not approve.';
        skipped.push({ id: row.id, reason: message });
      }
    }

    return { approved: approved.length, skipped };
  });

  /**
   * Send a chore back.
   *
   * The note is required - the schema refuses a rejection without one - because
   * "do it again" with no reason is the thing that makes a child give up. The
   * checklist is cleared so the steps are genuinely rechecked, and the submit
   * route will not accept the old photo as proof of the fix.
   */
  app.post('/api/parent/approvals/:instanceId/reject', { onRequest: requireParent }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { instanceId } = request.params as { instanceId: string };
    if (!uuid.safeParse(instanceId).success) throw app.httpErrors.notFound('No such submission.');

    const body = RejectBody.safeParse(request.body);
    if (!body.success) {
      throw app.httpErrors.badRequest('Tell them what needs fixing.');
    }

    const db = pool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{ status: string }>(
        `SELECT status FROM chore_instances WHERE id = $1 FOR UPDATE`,
        [instanceId],
      );
      const chore = rows[0];
      if (!chore) throw app.httpErrors.notFound('No such submission.');
      if (chore.status !== 'submitted') {
        throw app.httpErrors.conflict('That chore is not waiting for review.');
      }

      await client.query(
        `UPDATE chore_instances
            SET status = 'rejected', rejection_note = $2, reviewed_at = now(), reviewed_by = $3,
                submitted_punctual = NULL
          WHERE id = $1`,
        [instanceId, body.data.note, session.user.id],
      );

      // Cleared so "check everything again" means what it says on the screen.
      await client.query(
        `UPDATE chore_instance_subtasks SET done = false, done_at = NULL
          WHERE chore_instance_id = $1`,
        [instanceId],
      );

      const { rows: owner } = await client.query<{ assigned_to: string; name: string }>(
        `SELECT ci.assigned_to, d.name
           FROM chore_instances ci JOIN chore_definitions d ON d.id = ci.chore_definition_id
          WHERE ci.id = $1`,
        [instanceId],
      );
      if (owner[0]?.assigned_to) {
        await notify(client, {
          userId: owner[0].assigned_to,
          kind: 'chore_rejected',
          title: `${owner[0].name} needs fixing`,
          body: body.data.note,
          tone: 'late',
          deepLink: `#/child/chore/${instanceId}`,
          choreInstanceId: instanceId,
        });
      }

      await client.query('COMMIT');
      return { ok: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}
