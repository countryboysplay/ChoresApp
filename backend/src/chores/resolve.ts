import type pg from 'pg';

/**
 * Closing out a chore nobody finished.
 *
 * Owner decision: an unfinished chore stays open until a parent decides. It is
 * never marked missed by the passing of time, because that would let a parent
 * being busy on a Tuesday cost a child a fortnight's streak - a penalty nobody
 * chose to apply. The record says `missed` only when a person decided it.
 */
export type Resolution = 'excused' | 'missed' | 'carried_over';

export class ResolveError extends Error {
  constructor(
    readonly kind: 'not_found' | 'not_open',
    message: string,
  ) {
    super(message);
    this.name = 'ResolveError';
  }
}

/** Statuses a chore can still be resolved from: unfinished, undecided work. */
const OPEN = ['not_started', 'in_progress', 'rejected'] as const;

export interface ResolveResult {
  outcome: Resolution;
  /** The new instance created on today's list, when carrying over. */
  carriedTo: string | null;
}

export async function resolveChore(
  db: pg.Pool,
  parentId: string,
  instanceId: string,
  outcome: Resolution,
  today: string,
): Promise<ResolveResult> {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
      status: string;
      chore_date: string;
      chore_definition_id: string;
      assigned_to: string | null;
      points_value: number;
    }>(
      `SELECT status, chore_date::text AS chore_date, chore_definition_id,
              assigned_to, points_value
         FROM chore_instances WHERE id = $1 FOR UPDATE`,
      [instanceId],
    );

    const chore = rows[0];
    if (!chore) throw new ResolveError('not_found', 'No such chore.');
    if (!OPEN.includes(chore.status as (typeof OPEN)[number])) {
      throw new ResolveError('not_open', 'That chore has already been dealt with.');
    }
    if (!chore.assigned_to) {
      throw new ResolveError('not_open', 'Nobody was assigned that chore.');
    }

    let carriedTo: string | null = null;

    if (outcome === 'carried_over') {
      // A fresh copy on today's list rather than moving the original. Yesterday's
      // record stays truthful about what was due that day, and the child gets a
      // real chance to earn the points.
      const { rows: created } = await client.query<{ id: string }>(
        `INSERT INTO chore_instances
           (chore_definition_id, assigned_to, chore_date, points_value, carried_over_from)
         VALUES ($1, $2, $3::date, $4, $5)
         ON CONFLICT (chore_definition_id, assigned_to, chore_date)
           WHERE assigned_to IS NOT NULL
           DO NOTHING
         RETURNING id`,
        [chore.chore_definition_id, chore.assigned_to, today, chore.points_value, instanceId],
      );

      carriedTo = created[0]?.id ?? null;

      if (carriedTo) {
        // Snapshotted from the template, as everywhere else - not copied from
        // yesterday's ticks, which the child has to do again anyway.
        await client.query(
          `INSERT INTO chore_instance_subtasks
             (chore_instance_id, template_id, position, title, instruction)
           SELECT $1, t.id, t.position, t.title, t.instruction
             FROM chore_subtask_templates t
            WHERE t.chore_definition_id = $2`,
          [carriedTo, chore.chore_definition_id],
        );
      }
      // A null carriedTo means today already has this chore - the schedule
      // produced it. Closing the old one is still right; there is simply
      // nothing to create.
    }

    await client.query(
      `UPDATE chore_instances
          SET status = $2, reviewed_at = now(), reviewed_by = $3
        WHERE id = $1`,
      [instanceId, outcome, parentId],
    );

    await client.query('COMMIT');
    return { outcome, carriedTo };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
