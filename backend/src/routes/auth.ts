import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { SESSION_COOKIE, cookieOptions } from '../auth/plugin.js';
import { decoyHash, isValidPinFormat, verifyPin } from '../auth/pin.js';
import { FREE_ATTEMPTS, isLocked, lockedUntil, secondsRemaining } from '../auth/lockout.js';
import { createSession, revokeSession } from '../auth/sessions.js';

const LoginBody = z.object({
  userId: z.string().uuid(),
  pin: z.string(),
});

export async function authRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  /**
   * The "choose your hero" screen, before anyone is signed in. Returns only what
   * that screen draws: who exists, and whether they can be signed in to yet.
   * No PIN material, no points, no chore data.
   */
  app.get('/api/auth/profiles', async () => {
    const { rows } = await pool().query<{
      id: string;
      role: 'parent' | 'child';
      display_name: string;
      avatar: unknown;
      has_pin: boolean;
      lifetime_points: number | null;
    }>(
      // lifetime_points is here because the approved screen puts a level and a
      // total on every child's card. It is the only household figure served
      // before sign-in, and only for children - see AuthProfile in shared.
      `SELECT u.id, u.role, u.display_name, u.avatar,
              (u.pin_hash IS NOT NULL) AS has_pin,
              CASE WHEN u.role = 'child' THEN (
                SELECT coalesce(sum(delta) FILTER (WHERE delta > 0), 0)::int
                  FROM points_ledger WHERE child_id = u.id
              ) END AS lifetime_points
         FROM users u
        WHERE u.is_active
        ORDER BY u.role DESC, u.sort_order, u.display_name`,
    );

    return {
      profiles: rows.map((row) => ({
        id: row.id,
        role: row.role,
        displayName: row.display_name,
        avatar: row.avatar,
        hasPin: row.has_pin,
        lifetimePoints: row.lifetime_points,
      })),
    };
  });

  app.post('/api/auth/login', {
    config: {
      // A second gate in front of the per-user lockout, so a script cannot burn
      // through attempts for every profile at once from one connection.
      rateLimit: { max: 20, timeWindow: '1 minute' },
    },
  }, async (request, reply) => {
    const parsed = LoginBody.safeParse(request.body);
    if (!parsed.success) {
      throw app.httpErrors.badRequest('A profile and a PIN are required.');
    }
    const { userId, pin } = parsed.data;
    const now = new Date();

    const db = pool();
    const { rows } = await db.query<{
      id: string;
      role: 'parent' | 'child';
      pin_hash: string | null;
      failed_pin_attempts: number;
      pin_locked_until: Date | null;
      is_active: boolean;
    }>(
      `SELECT id, role, pin_hash, failed_pin_attempts, pin_locked_until, is_active
         FROM users WHERE id = $1`,
      [userId],
    );
    const user = rows[0];

    if (user && isLocked(user.pin_locked_until, now)) {
      const seconds = secondsRemaining(user.pin_locked_until as Date, now);
      await reply.code(429).send({
        error: {
          code: 'pin_locked',
          message: `Too many wrong tries. Try again in ${describeWait(seconds)}.`,
          details: { retryAfterSeconds: seconds },
        },
      });
      return;
    }

    // Always do the scrypt work, even for an unknown or PIN-less profile, so
    // response time does not reveal which profiles are set up. The cheap checks
    // are deliberately evaluated after the expensive one, for the same reason.
    const hashMatched = await verifyPin(pin, user?.pin_hash ?? (await decoyHash()));
    const matches = hashMatched && user !== undefined && user.is_active && isValidPinFormat(pin);

    if (!matches || user === undefined) {
      let remaining: number | undefined;
      if (user) {
        const attempts = user.failed_pin_attempts + 1;
        const lockUntil = lockedUntil(attempts, now);
        await db.query(
          `UPDATE users SET failed_pin_attempts = $2, pin_locked_until = $3 WHERE id = $1`,
          [user.id, attempts, lockUntil],
        );
        remaining = Math.max(0, FREE_ATTEMPTS - attempts);
      }

      await reply.code(401).send({
        error: {
          code: 'invalid_pin',
          message: 'That PIN is not right.',
          details: remaining === undefined ? undefined : { attemptsRemaining: remaining },
        },
      });
      return;
    }

    await db.query(
      `UPDATE users SET failed_pin_attempts = 0, pin_locked_until = NULL, last_login_at = $2
        WHERE id = $1`,
      [user.id, now],
    );

    const { token, expiresAt } = await createSession(
      db,
      {
        userId: user.id,
        role: user.role,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      },
      now,
    );

    reply.setCookie(SESSION_COOKIE, token, {
      ...cookieOptions(env),
      expires: expiresAt,
    });

    return {
      user: { id: user.id, role: user.role },
      expiresAt: expiresAt.toISOString(),
    };
  });

  /** Who am I? The frontend calls this on load to decide where to route. */
  app.get('/api/auth/me', async (request, reply) => {
    if (!request.session) {
      await reply.code(401).send({
        error: { code: 'not_authenticated', message: 'Sign in to continue.' },
      });
      return;
    }

    return {
      user: {
        id: request.session.user.id,
        role: request.session.user.role,
        displayName: request.session.user.displayName,
        avatar: request.session.user.avatar,
      },
      expiresAt: request.session.expiresAt.toISOString(),
    };
  });

  /** Always succeeds. Signing out must never fail on an already-dead session. */
  app.post('/api/auth/logout', async (request, reply) => {
    if (request.session) {
      await revokeSession(pool(), request.session.sessionId, request.session.user.id);
    }
    reply.clearCookie(SESSION_COOKIE, cookieOptions(env));
    return { ok: true };
  });
}

/** "45 seconds" / "3 minutes" - a child reads this on the PIN pad. */
function describeWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
