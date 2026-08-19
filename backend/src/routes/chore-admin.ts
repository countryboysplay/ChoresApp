import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { householdToday, isHouseholdDate } from '../time.js';

const ScheduleBody = z.object({
  assignedTo: z.string().uuid(),
  recurrence: z.enum(['daily', 'weekly']),
  /** ISO weekdays, 1 = Monday .. 7 = Sunday. Only read when weekly. */
  daysOfWeek: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  startsOn: z.string().optional(),
  endsOn: z.string().nullable().default(null),
});

const ChoreBody = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(40),
  points: z.number().int().positive().max(10_000),
  category: z.string().trim().max(40).nullable().default(null),
  instructions: z.string().trim().max(500).nullable().default(null),
  subtasks: z
    .array(z.object({ title: z.string().trim().min(1).max(120), instruction: z.string().trim().max(300).nullable().default(null) }))
    .max(30)
    .default([]),
  schedules: z.array(ScheduleBody).max(10).default([]),
});

/**
 * Chore definitions and the schedules that decide who owes what, when.
 *
 * This is the last data in the app that had to be written with SQL by hand, and
 * the reason a household could not be set up without the laptop's terminal.
 */
export async function choreAdminRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;
  const requireParent = app.requireAuth(['parent']);
  const uuid = z.string().uuid();

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  app.get('/api/parent/chores', { onRequest: requireParent }, async () => {
    const { rows } = await pool().query(
      `SELECT d.id, d.name, d.icon, d.points, d.category, d.instructions, d.is_active,
              coalesce(
                (SELECT json_agg(json_build_object('id', t.id, 'title', t.title, 'instruction', t.instruction)
                                 ORDER BY t.position)
                   FROM chore_subtask_templates t WHERE t.chore_definition_id = d.id),
                '[]'::json
              ) AS subtasks,
              coalesce(
                (SELECT json_agg(json_build_object(
                          'id', s.id, 'assignedTo', s.assigned_to, 'assignedToName', u.display_name,
                          'recurrence', s.recurrence, 'daysOfWeek', s.days_of_week,
                          'startsOn', s.starts_on::text, 'endsOn', s.ends_on::text,
                          'isActive', s.is_active)
                        ORDER BY u.display_name)
                   FROM chore_schedules s
                   JOIN users u ON u.id = s.assigned_to
                  WHERE s.chore_definition_id = d.id AND s.is_active),
                '[]'::json
              ) AS schedules
         FROM chore_definitions d
        WHERE d.kind = 'core'
        ORDER BY d.is_active DESC, d.name`,
    );

    return {
      chores: rows.map((row) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        points: row.points,
        category: row.category,
        instructions: row.instructions,
        isActive: row.is_active,
        subtasks: row.subtasks,
        schedules: row.schedules,
      })),
    };
  });

  app.post('/api/parent/chores', { onRequest: requireParent }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const body = ChoreBody.safeParse(request.body);
    if (!body.success) {
      throw app.httpErrors.badRequest(body.error.issues[0]?.message ?? 'That chore is not valid.');
    }
    const input = body.data;
    const today = householdToday(env.HOUSEHOLD_TZ);

    for (const schedule of input.schedules) {
      if (schedule.recurrence === 'weekly' && schedule.daysOfWeek.length === 0) {
        throw app.httpErrors.badRequest('A weekly chore needs at least one day.');
      }
      if (schedule.startsOn && !isHouseholdDate(schedule.startsOn)) {
        throw app.httpErrors.badRequest('Start date must be a calendar date, as YYYY-MM-DD.');
      }
      if (schedule.endsOn && !isHouseholdDate(schedule.endsOn)) {
        throw app.httpErrors.badRequest('End date must be a calendar date, as YYYY-MM-DD.');
      }
    }

    const db = pool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO chore_definitions (name, icon, kind, points, category, instructions, created_by)
         VALUES ($1, $2, 'core', $3, $4, $5, $6) RETURNING id`,
        [input.name, input.icon, input.points, input.category, input.instructions, session.user.id],
      );
      const choreId = rows[0]?.id as string;

      for (const [index, subtask] of input.subtasks.entries()) {
        await client.query(
          `INSERT INTO chore_subtask_templates (chore_definition_id, position, title, instruction)
           VALUES ($1, $2, $3, $4)`,
          [choreId, index, subtask.title, subtask.instruction],
        );
      }

      for (const schedule of input.schedules) {
        await client.query(
          `INSERT INTO chore_schedules
             (chore_definition_id, assigned_to, recurrence, days_of_week, starts_on, ends_on)
           VALUES ($1, $2, $3, $4, $5::date, $6::date)`,
          [
            choreId,
            schedule.assignedTo,
            schedule.recurrence,
            schedule.daysOfWeek,
            // Starting today rather than in the past, so creating a chore does
            // not immediately backfill a fortnight of it onto a child's list.
            schedule.startsOn ?? today,
            schedule.endsOn,
          ],
        );
      }

      await client.query('COMMIT');
      return { chore: { id: choreId } };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  /**
   * Edit a chore.
   *
   * Changing the points or the checklist affects chores generated from now on.
   * Instances already on a child's list keep the value and the wording they were
   * created with, by design - see the snapshot decision in DECISIONS.md.
   */
  app.patch('/api/parent/chores/:choreId', { onRequest: requireParent }, async (request) => {
    const { choreId } = request.params as { choreId: string };
    if (!uuid.safeParse(choreId).success) throw app.httpErrors.notFound('No such chore.');

    const body = ChoreBody.partial().safeParse(request.body);
    if (!body.success) throw app.httpErrors.badRequest('That change is not valid.');
    const input = body.data;

    const db = pool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rowCount } = await client.query(
        `UPDATE chore_definitions
            SET name = coalesce($2, name),
                icon = coalesce($3, icon),
                points = coalesce($4, points),
                category = coalesce($5, category),
                instructions = coalesce($6, instructions)
          WHERE id = $1 AND kind = 'core'`,
        [
          choreId,
          input.name ?? null,
          input.icon ?? null,
          input.points ?? null,
          input.category ?? null,
          input.instructions ?? null,
        ],
      );
      if (!rowCount) throw app.httpErrors.notFound('No such chore.');

      if (input.subtasks) {
        // Replaced wholesale. Instance subtasks are snapshots, so nothing a
        // child has already ticked is disturbed by this.
        await client.query('DELETE FROM chore_subtask_templates WHERE chore_definition_id = $1', [
          choreId,
        ]);
        for (const [index, subtask] of input.subtasks.entries()) {
          await client.query(
            `INSERT INTO chore_subtask_templates (chore_definition_id, position, title, instruction)
             VALUES ($1, $2, $3, $4)`,
            [choreId, index, subtask.title, subtask.instruction],
          );
        }
      }

      if (input.schedules) {
        // Stood down rather than deleted, so chore_instances keep pointing at
        // something and history stays readable.
        await client.query(
          'UPDATE chore_schedules SET is_active = false WHERE chore_definition_id = $1',
          [choreId],
        );
        for (const schedule of input.schedules) {
          if (schedule.recurrence === 'weekly' && schedule.daysOfWeek.length === 0) {
            throw app.httpErrors.badRequest('A weekly chore needs at least one day.');
          }
          await client.query(
            `INSERT INTO chore_schedules
               (chore_definition_id, assigned_to, recurrence, days_of_week, starts_on, ends_on)
             VALUES ($1, $2, $3, $4, $5::date, $6::date)`,
            [
              choreId,
              schedule.assignedTo,
              schedule.recurrence,
              schedule.daysOfWeek,
              schedule.startsOn ?? householdToday(env.HOUSEHOLD_TZ),
              schedule.endsOn,
            ],
          );
        }
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

  /**
   * Retire a chore. Its schedules stop, so no new instances appear, and every
   * chore already done keeps its place in the child's history.
   */
  app.delete('/api/parent/chores/:choreId', { onRequest: requireParent }, async (request) => {
    const { choreId } = request.params as { choreId: string };
    if (!uuid.safeParse(choreId).success) throw app.httpErrors.notFound('No such chore.');

    const db = pool();
    const { rowCount } = await db.query(
      `UPDATE chore_definitions SET is_active = false WHERE id = $1 AND kind = 'core'`,
      [choreId],
    );
    if (!rowCount) throw app.httpErrors.notFound('No such chore.');

    await db.query('UPDATE chore_schedules SET is_active = false WHERE chore_definition_id = $1', [
      choreId,
    ]);
    return { ok: true };
  });
}
