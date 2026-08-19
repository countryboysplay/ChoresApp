/**
 * Authentication tests.
 *
 * The pure units (hashing, lockout curve, device labels) run everywhere. The
 * end-to-end login tests need Postgres and skip without it, exactly like the
 * schema tests - CI supplies one.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import '../pg-parsers.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { hashPin, isTooCommon, isValidPinFormat, verifyPin } from '../auth/pin.js';
import { FREE_ATTEMPTS, isLocked, lockMinutesFor, secondsRemaining } from '../auth/lockout.js';
import {
  SESSION_TTL_DAYS,
  deviceLabelFrom,
  expiryFor,
  generateToken,
  hashToken,
} from '../auth/sessions.js';
import { SESSION_COOKIE } from '../auth/plugin.js';

describe('PIN hashing', () => {
  it('accepts exactly four digits and nothing else', () => {
    expect(isValidPinFormat('4821')).toBe(true);
    expect(isValidPinFormat('482')).toBe(false);
    expect(isValidPinFormat('48210')).toBe(false);
    expect(isValidPinFormat('48 1')).toBe(false);
    expect(isValidPinFormat('abcd')).toBe(false);
    expect(isValidPinFormat('')).toBe(false);
    // Arabic-Indic digits satisfy \d under some regex flavours. Not here.
    expect(isValidPinFormat('١٢٣٤')).toBe(false);
  });

  it('verifies a correct PIN and rejects a wrong one', async () => {
    const stored = await hashPin('4821');
    expect(await verifyPin('4821', stored)).toBe(true);
    expect(await verifyPin('4822', stored)).toBe(false);
  });

  it('salts, so the same PIN hashes differently every time', async () => {
    const [a, b] = await Promise.all([hashPin('4821'), hashPin('4821')]);
    expect(a).not.toBe(b);
    expect(await verifyPin('4821', a)).toBe(true);
    expect(await verifyPin('4821', b)).toBe(true);
  });

  it('records its parameters so they can change without a migration', async () => {
    const stored = await hashPin('4821');
    expect(stored.split('$').slice(0, 4)).toEqual(['scrypt', '32768', '8', '1']);
  });

  it('treats a missing or corrupt hash as a wrong PIN, never an error', async () => {
    for (const bad of [null, '', 'nonsense', 'scrypt$1$2$3', 'bcrypt$1$2$3$4$5', 'scrypt$x$y$z$a$b']) {
      await expect(verifyPin('4821', bad)).resolves.toBe(false);
    }
  });

  it('refuses the PINs a sibling guesses first', () => {
    expect(isTooCommon('1234')).toBe(true);
    expect(isTooCommon('0000')).toBe(true);
    expect(isTooCommon('4821')).toBe(false);
  });
});

describe('lockout curve', () => {
  it('costs nothing for an ordinary mistype', () => {
    for (let attempts = 1; attempts <= FREE_ATTEMPTS; attempts += 1) {
      expect(lockMinutesFor(attempts)).toBe(0);
    }
  });

  it('escalates once someone is clearly guessing, and caps at an hour', () => {
    expect(lockMinutesFor(5)).toBe(1);
    expect(lockMinutesFor(6)).toBe(2);
    expect(lockMinutesFor(7)).toBe(4);
    expect(lockMinutesFor(8)).toBe(8);
    expect(lockMinutesFor(11)).toBe(60);
    // Capped, so a locked-out child is never stuck until morning.
    expect(lockMinutesFor(50)).toBe(60);
  });

  it('makes exhausting 10,000 PINs take longer than a childhood', () => {
    // Past the cap every further attempt costs an hour, so the remaining
    // ~9,990 guesses need well over a year of continuous tapping.
    const hoursForRemaining = (10_000 - FREE_ATTEMPTS) * (lockMinutesFor(99) / 60);
    expect(hoursForRemaining / 24 / 365).toBeGreaterThan(1);
  });

  it('reports a lock as expired once its moment passes', () => {
    const now = new Date('2026-08-19T12:00:00Z');
    expect(isLocked(new Date('2026-08-19T12:00:01Z'), now)).toBe(true);
    expect(isLocked(new Date('2026-08-19T11:59:59Z'), now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
    expect(secondsRemaining(new Date('2026-08-19T12:00:45Z'), now)).toBe(45);
  });
});

describe('session tokens', () => {
  it('generates unguessable, unique tokens', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateToken()));
    expect(tokens.size).toBe(500);
    // 32 bytes base64url.
    expect([...tokens][0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes deterministically, and never stores the token itself', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps kids signed in far longer than parents', () => {
    expect(SESSION_TTL_DAYS.child).toBeGreaterThan(SESSION_TTL_DAYS.parent);
    const now = new Date('2026-08-19T12:00:00Z');
    expect(expiryFor('child', now).getTime()).toBeGreaterThan(expiryFor('parent', now).getTime());
  });

  it('names devices in a way a parent can recognise', () => {
    expect(deviceLabelFrom('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iPhone');
    expect(deviceLabelFrom('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('iPad');
    expect(deviceLabelFrom('Mozilla/5.0 (Linux; Android 14; Pixel) Mobile')).toBe('Android phone');
    expect(deviceLabelFrom('Mozilla/5.0 (Windows NT 10.0; Win64)')).toBe('Windows computer');
    expect(deviceLabelFrom(undefined)).toBe('Unknown device');
  });
});

// --- End-to-end, needs a database -------------------------------------------

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '4002',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: 'America/Chicago',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: connectionString,
  SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
} as NodeJS.ProcessEnv);

let pool: pg.Pool;
const createdUserIds: string[] = [];

async function makeUser(role: 'parent' | 'child', pin: string | null, name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (role, display_name, pin_hash, pin_set_at)
     VALUES ($1, $2, $3, CASE WHEN $3::text IS NULL THEN NULL ELSE now() END)
     RETURNING id`,
    [role, name, pin ? await hashPin(pin) : null],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('failed to create test user');
  createdUserIds.push(id);
  return id;
}

/** Pulls the session cookie out of a login response so it can be replayed. */
function sessionCookieFrom(headers: Record<string, unknown>): string | undefined {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = list.find((entry) => entry.startsWith(`${SESSION_COOKIE}=`));
  return found?.split(';')[0];
}

beforeAll(() => {
  if (connectionString) pool = new pg.Pool({ connectionString, max: 4 });
});

afterEach(async () => {
  // Cascades to sessions. Keeps each test independent without a transaction,
  // which is necessary because the app opens its own pool.
  if (createdUserIds.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    createdUserIds.length = 0;
  }
});

afterAll(async () => {
  await pool?.end();
});

describeDb('login', () => {
  it('signs a child in and sets an httpOnly cookie', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', '4821', 'Login Child');

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: childId, pin: '4821' },
      headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.role).toBe('child');

    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    // The token must be unreachable from JavaScript on the page.
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    const { rows } = await pool.query(
      'SELECT device_label, user_agent FROM sessions WHERE user_id = $1',
      [childId],
    );
    expect(rows[0]?.device_label).toBe('iPhone');
    await app.close();
  });

  it('never puts the raw token in the database', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', '4821', 'Token Child');

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: childId, pin: '4821' },
    });
    const cookie = sessionCookieFrom(response.headers);
    const token = cookie?.split('=')[1] ?? '';

    const { rows } = await pool.query('SELECT token_hash FROM sessions WHERE user_id = $1', [childId]);
    expect(rows[0]?.token_hash).not.toContain(token);
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    await app.close();
  });

  it('rejects a wrong PIN and counts it', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', '4821', 'Wrong Child');

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: childId, pin: '9999' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('invalid_pin');
    expect(response.headers['set-cookie']).toBeUndefined();

    const { rows } = await pool.query('SELECT failed_pin_attempts FROM users WHERE id = $1', [childId]);
    expect(rows[0]?.failed_pin_attempts).toBe(1);
    await app.close();
  });

  it('locks the profile after repeated wrong PINs and stops checking', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', '4821', 'Locked Child');

    for (let i = 0; i < FREE_ATTEMPTS + 1; i += 1) {
      await app.inject({ method: 'POST', url: '/api/auth/login', payload: { userId: childId, pin: '0001' } });
    }

    // Even the correct PIN is refused while the lock stands, or the lock would
    // only inconvenience someone who already knows it.
    const correct = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: childId, pin: '4821' },
    });
    expect(correct.statusCode).toBe(429);
    expect(correct.json().error.code).toBe('pin_locked');
    expect(correct.json().error.details.retryAfterSeconds).toBeGreaterThan(0);
    await app.close();
  });

  it('clears the failure count on a successful sign-in', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', '4821', 'Reset Child');

    await app.inject({ method: 'POST', url: '/api/auth/login', payload: { userId: childId, pin: '0001' } });
    await app.inject({ method: 'POST', url: '/api/auth/login', payload: { userId: childId, pin: '4821' } });

    const { rows } = await pool.query(
      'SELECT failed_pin_attempts, pin_locked_until, last_login_at FROM users WHERE id = $1',
      [childId],
    );
    expect(rows[0]?.failed_pin_attempts).toBe(0);
    expect(rows[0]?.pin_locked_until).toBeNull();
    expect(rows[0]?.last_login_at).not.toBeNull();
    await app.close();
  });

  it('refuses a profile that has no PIN set', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', null, 'Pinless Child');

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: childId, pin: '4821' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('refuses a deactivated member', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', '4821', 'Inactive Child');
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [childId]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: childId, pin: '4821' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

describeDb('session lifecycle', () => {
  it('answers /me with the signed-in member, and 401 without a cookie', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', '4821', 'Me Child');

    const anonymous = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(anonymous.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: childId, pin: '4821' },
    });
    const cookie = sessionCookieFrom(login.headers);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.id).toBe(childId);
    expect(me.json().user.displayName).toBe('Me Child');
    await app.close();
  });

  it('stops accepting the cookie after logout', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', '4821', 'Logout Child');

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: childId, pin: '4821' },
    });
    const cookie = sessionCookieFrom(login.headers);

    // No body, but the browser still sends application/json. Fastify's built-in
    // parser calls that malformed, which would make signing out fail.
    const loggedOut = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, 'content-type': 'application/json' },
    });
    expect(loggedOut.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);

    const { rows } = await pool.query('SELECT revoked_at FROM sessions WHERE user_id = $1', [childId]);
    expect(rows[0]?.revoked_at).not.toBeNull();
    await app.close();
  });

  it('rejects a malformed JSON body without crashing', async () => {
    const app = await buildApp({ env: testEnv });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{ this is not json',
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('rejects a forged or tampered cookie', async () => {
    const app = await buildApp({ env: testEnv });

    for (const cookie of [
      `${SESSION_COOKIE}=not-a-real-token`,
      `${SESSION_COOKIE}=`,
      `${SESSION_COOKIE}=${generateToken()}`,
    ]) {
      const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
      expect(response.statusCode).toBe(401);
    }
    await app.close();
  });

  it('drops a session the moment the member is deactivated', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', '4821', 'Deactivated Child');

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: childId, pin: '4821' },
    });
    const cookie = sessionCookieFrom(login.headers);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(200);

    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [childId]);

    // No separate "revoke their sessions" step should be required.
    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
    await app.close();
  });

  it('refuses an expired session', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', '4821', 'Expired Child');

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { userId: childId, pin: '4821' },
    });
    const cookie = sessionCookieFrom(login.headers);

    // created_at moves back too. The sessions_expires_after_created constraint
    // correctly refuses a row that expired before it began, so simulating age
    // means ageing the whole row rather than only its expiry.
    await pool.query(
      `UPDATE sessions
          SET created_at = now() - interval '100 days',
              expires_at = now() - interval '1 second'
        WHERE user_id = $1`,
      [childId],
    );

    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
    await app.close();
  });
});

describeDb('the profile list', () => {
  it('shows who exists without leaking anything about their PIN', async () => {
    const app = await buildApp({ env: testEnv });
    await makeUser('child', '4821', 'Visible Child');
    await makeUser('child', null, 'Unconfigured Child');

    const response = await app.inject({ method: 'GET', url: '/api/auth/profiles' });
    expect(response.statusCode).toBe(200);

    const body = response.body;
    expect(body).not.toContain('scrypt');
    expect(body).not.toContain('pin_hash');

    const profiles = response.json().profiles as { displayName: string; hasPin: boolean }[];
    expect(profiles.find((p) => p.displayName === 'Visible Child')?.hasPin).toBe(true);
    expect(profiles.find((p) => p.displayName === 'Unconfigured Child')?.hasPin).toBe(false);
    await app.close();
  });

  it('hides deactivated members', async () => {
    const app = await buildApp({ env: testEnv });
    const childId = await makeUser('child', '4821', 'Hidden Child');
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [childId]);

    const response = await app.inject({ method: 'GET', url: '/api/auth/profiles' });
    const names = (response.json().profiles as { displayName: string }[]).map((p) => p.displayName);
    expect(names).not.toContain('Hidden Child');
    await app.close();
  });
});
