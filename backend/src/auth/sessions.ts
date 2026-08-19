import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import type { Role } from '@chore-quest/shared';

/**
 * Opaque, database-backed sessions.
 *
 * Not JWTs: a parent has to be able to sign a lost phone out and have that take
 * effect immediately. A stateless token cannot be withdrawn without building
 * the revocation list that a sessions table already is.
 *
 * Only the SHA-256 of the token is stored. A plain hash is right here where a
 * password would need a slow KDF, because the token is 256 bits of randomness
 * rather than something a person chose - there is no dictionary to run.
 */

const TOKEN_BYTES = 32;

/**
 * Kids stay signed in on a trusted device; parents do not. A child locked out
 * of their own chores mid-week is a support call and a bad experience, while a
 * parent session can approve chores, move points, and change money settings, so
 * it should not sit unlocked on a shared tablet for a month.
 */
export const SESSION_TTL_DAYS: Record<Role, number> = {
  child: 90,
  parent: 1,
};

/**
 * Sessions extend on use, but the write is skipped unless the row is stale, so
 * a child refreshing their chore list does not write to Postgres every request.
 */
const TOUCH_AFTER_MS = 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  role: Role;
  displayName: string;
  avatar: unknown;
}

export interface AuthenticatedSession {
  sessionId: string;
  user: SessionUser;
  expiresAt: Date;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function expiryFor(role: Role, now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_DAYS[role] * 24 * 60 * 60 * 1000);
}

/**
 * Turns a user agent into something a parent can recognise on the devices list.
 * Deliberately coarse - the point is "which phone is this", not analytics.
 */
export function deviceLabelFrom(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown device';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? 'Android phone' : 'Android tablet';
  if (/Windows/i.test(userAgent)) return 'Windows computer';
  if (/Macintosh/i.test(userAgent)) return 'Mac';
  if (/Linux/i.test(userAgent)) return 'Linux computer';
  return 'Unknown device';
}

export async function createSession(
  db: pg.Pool | pg.PoolClient,
  input: { userId: string; role: Role; userAgent?: string; ip?: string },
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = expiryFor(input.role, now);

  await db.query(
    `INSERT INTO sessions (user_id, token_hash, device_label, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.userId,
      hashToken(token),
      deviceLabelFrom(input.userAgent),
      input.userAgent ?? null,
      input.ip ?? null,
      expiresAt,
    ],
  );

  return { token, expiresAt };
}

/** Null for anything not currently usable: unknown, expired, or revoked. */
export async function resolveSession(
  db: pg.Pool | pg.PoolClient,
  token: string,
  now = new Date(),
): Promise<AuthenticatedSession | null> {
  const { rows } = await db.query<{
    id: string;
    user_id: string;
    role: Role;
    display_name: string;
    avatar: unknown;
    expires_at: Date;
    last_seen_at: Date;
    is_active: boolean;
  }>(
    `SELECT s.id, s.user_id, s.expires_at, s.last_seen_at,
            u.role, u.display_name, u.avatar, u.is_active
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > $2`,
    [hashToken(token), now],
  );

  const row = rows[0];
  // A deactivated child must lose access immediately, without anyone having to
  // remember to also revoke every session they had open.
  if (!row || !row.is_active) return null;

  if (now.getTime() - row.last_seen_at.getTime() > TOUCH_AFTER_MS) {
    await db.query(
      `UPDATE sessions SET last_seen_at = $2, expires_at = $3 WHERE id = $1`,
      [row.id, now, expiryFor(row.role, now)],
    );
  }

  return {
    sessionId: row.id,
    user: {
      id: row.user_id,
      role: row.role,
      displayName: row.display_name,
      avatar: row.avatar,
    },
    expiresAt: row.expires_at,
  };
}

export async function revokeSession(
  db: pg.Pool | pg.PoolClient,
  sessionId: string,
  revokedBy: string | null,
  now = new Date(),
): Promise<void> {
  await db.query(
    `UPDATE sessions SET revoked_at = $2, revoked_by = $3
      WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId, now, revokedBy],
  );
}

/** Used when a PIN changes: every other device has to sign in again. */
export async function revokeAllForUser(
  db: pg.Pool | pg.PoolClient,
  userId: string,
  options: { except?: string; revokedBy?: string | null } = {},
  now = new Date(),
): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE sessions SET revoked_at = $2, revoked_by = $3
      WHERE user_id = $1 AND revoked_at IS NULL AND ($4::uuid IS NULL OR id <> $4)`,
    [userId, now, options.revokedBy ?? null, options.except ?? null],
  );
  return rowCount ?? 0;
}
