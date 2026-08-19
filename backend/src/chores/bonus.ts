import type pg from 'pg';

/**
 * Bonus chores: posted by a parent, claimed by whoever gets there first.
 *
 * Two household rules, both owner decisions on 2026-08-19:
 *
 *  - A claimed bonus goes back on the board if its deadline passes unfinished.
 *    No penalty and no missed status; the work still needs doing and a sibling
 *    should get the chance.
 *  - A child holds one unfinished bonus at a time. Together with the release,
 *    that makes claiming everything to block a sibling pointless: a second claim
 *    means finishing or releasing the first, and sitting on one just hands it
 *    back.
 */

/** Statuses that mean a claim is still open work rather than finished. */
export const UNFINISHED = ['not_started', 'in_progress', 'rejected'] as const;

/**
 * Returns expired, unfinished claims to the board.
 *
 * Lazy, like day materialisation, and for the same reason: the laptop sleeps, so
 * a timer would miss the moment. Called before anything reads the board, so the
 * first person to look is the one who triggers it.
 *
 * A submitted or approved bonus is never released - the work was done, and it is
 * waiting on a parent rather than on the child.
 */
export async function releaseExpiredClaims(db: pg.Pool, now = new Date()): Promise<number> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ id: string }>(
      `UPDATE chore_instances ci
          SET assigned_to = NULL,
              claimed_at = NULL,
              status = 'not_started',
              started_at = NULL,
              -- A fresh window of the same length the parent originally gave
              -- it. Returning it with an expiry already in the past would take
              -- it off the board entirely, which is precisely the blocking the
              -- one-at-a-time rule exists to prevent: claim it, sit on it, and
              -- nobody else ever gets the chance.
              expires_at = $1::timestamptz
                + make_interval(mins => coalesce(ci.claim_window_minutes, 120))
         FROM chore_definitions d
        WHERE d.id = ci.chore_definition_id
          AND d.kind = 'bonus'
          AND ci.assigned_to IS NOT NULL
          AND ci.expires_at IS NOT NULL
          AND ci.expires_at <= $1
          AND ci.status = ANY($2::chore_status[])
        RETURNING ci.id`,
      [now, UNFINISHED],
    );

    if (rows.length > 0) {
      // Whoever takes it next starts from a clean checklist rather than
      // inheriting half-ticked steps from the child who let it lapse.
      await client.query(
        `UPDATE chore_instance_subtasks SET done = false, done_at = NULL
          WHERE chore_instance_id = ANY($1::uuid[])`,
        [rows.map((row) => row.id)],
      );
    }

    await client.query('COMMIT');
    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type ClaimFailure =
  | 'not_found'
  | 'already_claimed'
  | 'expired'
  | 'already_holding'
  | 'not_yours';

export class BonusError extends Error {
  constructor(readonly kind: ClaimFailure, message: string) {
    super(message);
    this.name = 'BonusError';
  }
}

/**
 * Claims one bonus chore for a child.
 *
 * The instance row is locked first, so two children tapping at the same moment
 * queue up and the second is told it has gone rather than both being told they
 * have it.
 */
export async function claimBonus(
  db: pg.Pool,
  childId: string,
  instanceId: string,
  now = new Date(),
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
      assigned_to: string | null;
      expires_at: Date | null;
      status: string;
      is_active: boolean;
      kind: string;
    }>(
      `SELECT ci.assigned_to, ci.expires_at, ci.status, d.is_active, d.kind
         FROM chore_instances ci
         JOIN chore_definitions d ON d.id = ci.chore_definition_id
        WHERE ci.id = $1
        FOR UPDATE OF ci`,
      [instanceId],
    );

    const bonus = rows[0];
    if (!bonus || bonus.kind !== 'bonus' || !bonus.is_active) {
      throw new BonusError('not_found', 'That bonus chore is not available.');
    }
    if (bonus.assigned_to) {
      throw new BonusError('already_claimed', 'Someone else claimed that one first.');
    }
    if (bonus.expires_at && bonus.expires_at <= now) {
      throw new BonusError('expired', 'That bonus chore has expired.');
    }

    // One at a time. Counted inside the transaction so two simultaneous claims
    // by the same child cannot both pass the check.
    const { rows: held } = await client.query<{ held: number }>(
      `SELECT count(*)::int AS held
         FROM chore_instances ci
         JOIN chore_definitions d ON d.id = ci.chore_definition_id
        WHERE d.kind = 'bonus'
          AND ci.assigned_to = $1
          AND ci.status = ANY($2::chore_status[])`,
      [childId, UNFINISHED],
    );
    if ((held[0]?.held ?? 0) > 0) {
      throw new BonusError(
        'already_holding',
        'Finish or give back your other bonus chore first.',
      );
    }

    await client.query(
      `UPDATE chore_instances SET assigned_to = $2, claimed_at = $3 WHERE id = $1`,
      [instanceId, childId, now],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Gives a claimed bonus back voluntarily.
 *
 * Only while it is still unfinished - once it has been sent for review it
 * belongs to the parent's queue, not the child.
 */
export async function releaseBonus(
  db: pg.Pool,
  childId: string,
  instanceId: string,
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query(
      `UPDATE chore_instances ci
          SET assigned_to = NULL, claimed_at = NULL, status = 'not_started', started_at = NULL
         FROM chore_definitions d
        WHERE d.id = ci.chore_definition_id
          AND ci.id = $1
          AND ci.assigned_to = $2
          AND d.kind = 'bonus'
          AND ci.status = ANY($3::chore_status[])`,
      [instanceId, childId, UNFINISHED],
    );

    if (!rowCount) {
      throw new BonusError('not_yours', 'That is not a bonus chore you can give back.');
    }

    await client.query(
      `UPDATE chore_instance_subtasks SET done = false, done_at = NULL
        WHERE chore_instance_id = $1`,
      [instanceId],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
