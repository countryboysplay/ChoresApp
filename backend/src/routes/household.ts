import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { hashPin, isTooCommon, isValidPinFormat } from '../auth/pin.js';
import { revokeAllForUser } from '../auth/sessions.js';

const ChildBody = z.object({
  displayName: z.string().trim().min(1).max(40),
  avatar: z.record(z.unknown()).nullable().default(null),
  sortOrder: z.number().int().min(0).max(99).default(0),
  /** Optional at creation; a child without one simply cannot sign in yet. */
  pin: z.string().optional(),
});

const ChildPatch = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  avatar: z.record(z.unknown()).nullable().optional(),
  sortOrder: z.number().int().min(0).max(99).optional(),
  isActive: z.boolean().optional(),
});

const PinBody = z.object({ pin: z.string() });

/** 00:00 to 23:59. */
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const SettingsBody = z.object({
  corePointValue: z.number().int().positive().max(1000).optional(),
  punctualityBonusPoints: z.number().int().min(0).max(1000).optional(),
  /** Null turns cash-out back off. Never defaulted; see DECISIONS.md. */
  pointsPerDollar: z.number().positive().max(100_000).nullable().optional(),
  minimumCashOutPoints: z.number().int().min(0).max(1_000_000).nullable().optional(),
  // A real clock time, not just two pairs of digits. "25:00" satisfies the
  // looser pattern and then reaches Postgres, which rejects it as a 500 - a
  // typo in a settings field should read as "that is not a time", not a crash.
  reminderTime: z.string().regex(CLOCK_TIME).optional(),
  escalationTime: z.string().regex(CLOCK_TIME).optional(),
});

/**
 * Household setup: the people in it, and the rules that govern it.
 *
 * Children are managed here. Parents deliberately are not - adding a parent,
 * changing another parent's PIN, and deactivating a parent stay terminal jobs on
 * the laptop, so no argument, mis-tap, or curious child on an unlocked parent
 * phone can lock the other parent out of the household.
 */
export async function householdRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  void opts;
  const requireParent = app.requireAuth(['parent']);
  const uuid = z.string().uuid();

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  /** Throws unless the id belongs to a child. Parents are read-only here. */
  async function requireChildRow(userId: string): Promise<void> {
    const { rows } = await pool().query<{ role: string }>('SELECT role FROM users WHERE id = $1', [
      userId,
    ]);
    const found = rows[0];
    if (!found) throw app.httpErrors.notFound('No such person.');
    if (found.role !== 'child') {
      throw app.httpErrors.forbidden(
        'Parent accounts are managed from the laptop: npm run user -w backend',
      );
    }
  }

  app.get('/api/parent/members', { onRequest: requireParent }, async () => {
    const { rows } = await pool().query(
      `SELECT u.id, u.role, u.display_name, u.avatar, u.sort_order, u.is_active,
              (u.pin_hash IS NOT NULL) AS has_pin, u.last_login_at,
              coalesce((SELECT sum(delta) FROM points_ledger p WHERE p.child_id = u.id), 0)::int AS balance,
              (SELECT count(*)::int FROM sessions s
                WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS devices
         FROM users u
        ORDER BY u.role DESC, u.sort_order, u.display_name`,
    );

    return {
      members: rows.map((row) => ({
        id: row.id,
        role: row.role,
        displayName: row.display_name,
        avatar: row.avatar,
        sortOrder: row.sort_order,
        isActive: row.is_active,
        hasPin: row.has_pin,
        lastLoginAt: row.last_login_at?.toISOString() ?? null,
        balance: row.role === 'child' ? row.balance : null,
        signedInDevices: row.devices,
        /** The UI greys out controls for parents rather than hiding them. */
        managedHere: row.role === 'child',
      })),
    };
  });

  app.post('/api/parent/members', { onRequest: requireParent }, async (request) => {
    const body = ChildBody.safeParse(request.body);
    if (!body.success) throw app.httpErrors.badRequest('That child is not valid.');
    const input = body.data;

    if (input.pin !== undefined) {
      if (!isValidPinFormat(input.pin)) throw app.httpErrors.badRequest('A PIN is four digits.');
      if (isTooCommon(input.pin)) {
        throw app.httpErrors.badRequest('That is one of the first PINs anyone guesses.');
      }
    }

    const { rows } = await pool().query<{ id: string }>(
      `INSERT INTO users (role, display_name, avatar, sort_order, pin_hash, pin_set_at)
       VALUES ('child', $1, $2, $3, $4, CASE WHEN $4::text IS NULL THEN NULL ELSE now() END)
       RETURNING id`,
      [
        input.displayName,
        input.avatar ? JSON.stringify(input.avatar) : null,
        input.sortOrder,
        input.pin ? await hashPin(input.pin) : null,
      ],
    );

    return { member: { id: rows[0]?.id } };
  });

  app.patch('/api/parent/members/:userId', { onRequest: requireParent }, async (request) => {
    const { userId } = request.params as { userId: string };
    if (!uuid.safeParse(userId).success) throw app.httpErrors.notFound('No such person.');
    await requireChildRow(userId);

    const body = ChildPatch.safeParse(request.body);
    if (!body.success) throw app.httpErrors.badRequest('That change is not valid.');
    const input = body.data;

    await pool().query(
      `UPDATE users
          SET display_name = coalesce($2, display_name),
              avatar = coalesce($3::jsonb, avatar),
              sort_order = coalesce($4, sort_order),
              is_active = coalesce($5, is_active)
        WHERE id = $1`,
      [
        userId,
        input.displayName ?? null,
        input.avatar ? JSON.stringify(input.avatar) : null,
        input.sortOrder ?? null,
        input.isActive ?? null,
      ],
    );

    // A deactivated child loses access at once; resolveSession checks is_active,
    // so this is belt and braces rather than the mechanism.
    if (input.isActive === false) {
      await revokeAllForUser(pool(), userId, { revokedBy: request.session?.user.id ?? null });
    }

    return { ok: true };
  });

  /**
   * Set or reset a child's PIN.
   *
   * Every device that child is signed in on is signed out. Resetting a PIN after
   * a phone goes missing would achieve nothing otherwise.
   */
  app.put('/api/parent/members/:userId/pin', { onRequest: requireParent }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const { userId } = request.params as { userId: string };
    if (!uuid.safeParse(userId).success) throw app.httpErrors.notFound('No such person.');
    await requireChildRow(userId);

    const body = PinBody.safeParse(request.body);
    if (!body.success) throw app.httpErrors.badRequest('A PIN is four digits.');

    const { pin } = body.data;
    if (!isValidPinFormat(pin)) throw app.httpErrors.badRequest('A PIN is four digits.');
    if (isTooCommon(pin)) {
      throw app.httpErrors.badRequest('That is one of the first PINs anyone guesses. Pick another.');
    }

    const db = pool();
    await db.query(
      `UPDATE users
          SET pin_hash = $2, pin_set_at = now(), failed_pin_attempts = 0, pin_locked_until = NULL
        WHERE id = $1`,
      [userId, await hashPin(pin)],
    );
    const revoked = await revokeAllForUser(db, userId, { revokedBy: session.user.id });

    return { ok: true, signedOutDevices: revoked };
  });

  // --- Household settings ----------------------------------------------------

  app.get('/api/parent/settings', { onRequest: requireParent }, async () => {
    const { rows } = await pool().query(
      `SELECT core_point_value, punctuality_bonus_points, points_per_dollar,
              minimum_cash_out_points, weekly_cash_out_cap_cents,
              to_char(reminder_time, 'HH24:MI') AS reminder_time,
              to_char(escalation_time, 'HH24:MI') AS escalation_time,
              timezone
         FROM household_settings`,
    );
    const row = rows[0];
    if (!row) throw app.httpErrors.internalServerError('Household settings are missing.');

    return {
      settings: {
        corePointValue: row.core_point_value,
        punctualityBonusPoints: row.punctuality_bonus_points,
        pointsPerDollar: row.points_per_dollar,
        minimumCashOutPoints: row.minimum_cash_out_points,
        /** Fixed by the specification at $40; shown, not editable. */
        weeklyCashOutCapCents: row.weekly_cash_out_cap_cents,
        reminderTime: row.reminder_time,
        escalationTime: row.escalation_time,
        timezone: row.timezone,
        cashOutConfigured:
          row.points_per_dollar !== null && row.minimum_cash_out_points !== null,
      },
    };
  });

  app.patch('/api/parent/settings', { onRequest: requireParent }, async (request) => {
    const body = SettingsBody.safeParse(request.body);
    if (!body.success) {
      throw app.httpErrors.badRequest('Those settings are not valid.');
    }
    const input = body.data;

    // The two money values are only meaningful together, so setting one without
    // the other would leave cash-out half-configured and the screen unable to
    // say which half is missing.
    const settingRate = input.pointsPerDollar !== undefined;
    const settingMinimum = input.minimumCashOutPoints !== undefined;
    if (settingRate !== settingMinimum) {
      throw app.httpErrors.badRequest(
        'Set the points-per-dollar rate and the minimum together, or neither.',
      );
    }
    if (settingRate && (input.pointsPerDollar === null) !== (input.minimumCashOutPoints === null)) {
      throw app.httpErrors.badRequest(
        'Turn cash out on with both values, or off by clearing both.',
      );
    }

    await pool().query(
      `UPDATE household_settings
          SET core_point_value = coalesce($1, core_point_value),
              punctuality_bonus_points = coalesce($2, punctuality_bonus_points),
              points_per_dollar = CASE WHEN $3::boolean THEN $4::numeric ELSE points_per_dollar END,
              minimum_cash_out_points = CASE WHEN $3::boolean THEN $5::integer ELSE minimum_cash_out_points END,
              reminder_time = coalesce($6::time, reminder_time),
              escalation_time = coalesce($7::time, escalation_time)`,
      [
        input.corePointValue ?? null,
        input.punctualityBonusPoints ?? null,
        settingRate,
        input.pointsPerDollar ?? null,
        input.minimumCashOutPoints ?? null,
        input.reminderTime ?? null,
        input.escalationTime ?? null,
      ],
    );

    return { ok: true };
  });
}
