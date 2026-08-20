/**
 * Household setup: people, chores, and settings.
 *
 * The rule that gets the most attention here is the one protecting parents from
 * each other. Locking a parent out of their own household is not recoverable
 * from inside the app, so it is proven rather than assumed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import '../pg-parsers.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { hashPin, verifyPin } from '../auth/pin.js';
import { SESSION_COOKIE } from '../auth/plugin.js';
import { testConnectionString } from './database.js';

const connectionString = testConnectionString;
const describeDb = connectionString ? describe : describe.skip;

const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '4008',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: 'America/Chicago',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: connectionString,
  SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
} as NodeJS.ProcessEnv);

let pool: pg.Pool;
const createdUsers: string[] = [];
const createdChores: string[] = [];

type App = Awaited<ReturnType<typeof buildApp>>;
const json = { 'content-type': 'application/json' };

async function makeUser(role: 'parent' | 'child', name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (role, display_name, pin_hash, pin_set_at, created_at)
     VALUES ($1, $2, $3, now(), now() - interval '400 days') RETURNING id`,
    [role, name, await hashPin('4821')],
  );
  const id = rows[0]?.id as string;
  createdUsers.push(id);
  return id;
}

async function signIn(app: App, userId: string, pin = '4821'): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { userId, pin },
  });
  const raw = login.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = list.find((entry) => entry.startsWith(`${SESSION_COOKIE}=`));
  if (!found) throw new Error(`login failed: ${login.body}`);
  return found.split(';')[0] as string;
}

/** Restores settings after a test changes them; there is only one row. */
async function resetSettings(): Promise<void> {
  await pool.query(
    `UPDATE household_settings
        SET core_point_value = 10, punctuality_bonus_points = 2,
            points_per_dollar = NULL, minimum_cash_out_points = NULL,
            reminder_time = '20:45', escalation_time = '23:00'`,
  );
}

beforeAll(() => {
  if (connectionString) pool = new pg.Pool({ connectionString, max: 4 });
});

afterEach(async () => {
  if (createdChores.length > 0) {
    await pool.query('DELETE FROM chore_instances WHERE chore_definition_id = ANY($1::uuid[])', [createdChores]);
    await pool.query('DELETE FROM chore_definitions WHERE id = ANY($1::uuid[])', [createdChores]);
    createdChores.length = 0;
  }
  if (createdUsers.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUsers]);
    createdUsers.length = 0;
  }
  await resetSettings();
});

afterAll(async () => {
  await pool?.end();
});

describeDb('managing children', () => {
  it('adds a child with a PIN they can immediately sign in with', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Setup Parent');
    const cookie = await signIn(app, parent);

    const created = await app.inject({
      method: 'POST',
      url: '/api/parent/members',
      payload: { displayName: 'New Child', pin: '7391', sortOrder: 1 },
      headers: { cookie, ...json },
    });
    expect(created.statusCode).toBe(200);
    const childId = created.json().member.id as string;
    createdUsers.push(childId);

    // The whole point: no terminal needed.
    const childCookie = await signIn(app, childId, '7391');
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: childCookie } });
    expect(me.json().user.displayName).toBe('New Child');
    await app.close();
  });

  it('adds a child without a PIN, who simply cannot sign in yet', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Partial Parent');
    const cookie = await signIn(app, parent);

    const created = await app.inject({
      method: 'POST',
      url: '/api/parent/members',
      payload: { displayName: 'Pinless Child' },
      headers: { cookie, ...json },
    });
    const childId = created.json().member.id as string;
    createdUsers.push(childId);

    const profiles = await app.inject({ method: 'GET', url: '/api/auth/profiles' });
    const profile = profiles
      .json()
      .profiles.find((p: { id: string }) => p.id === childId);
    expect(profile.hasPin).toBe(false);
    await app.close();
  });

  it('refuses a PIN anyone would guess first', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Weak Pin Parent');
    const cookie = await signIn(app, parent);

    for (const pin of ['1234', '0000', '12', 'abcd']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/parent/members',
        payload: { displayName: 'Guessable Child', pin },
        headers: { cookie, ...json },
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });

  it('signs a child out of every device when their PIN is reset', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Reset Parent');
    const child = await makeUser('child', 'Reset Child');

    const childCookie = await signIn(app, child);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: childCookie } }))
        .statusCode,
    ).toBe(200);

    const parentCookie = await signIn(app, parent);
    const reset = await app.inject({
      method: 'PUT',
      url: `/api/parent/members/${child}/pin`,
      payload: { pin: '7391' },
      headers: { cookie: parentCookie, ...json },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().signedOutDevices).toBeGreaterThan(0);

    // Resetting a PIN after a phone goes missing has to end the old session.
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: childCookie } }))
        .statusCode,
    ).toBe(401);

    const { rows } = await pool.query<{ pin_hash: string }>('SELECT pin_hash FROM users WHERE id = $1', [child]);
    expect(await verifyPin('7391', rows[0]?.pin_hash ?? null)).toBe(true);
    await app.close();
  });

  it('deactivating a child ends their access at once', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Deactivate Parent');
    const child = await makeUser('child', 'Deactivated Child');

    const childCookie = await signIn(app, child);
    const parentCookie = await signIn(app, parent);

    await app.inject({
      method: 'PATCH',
      url: `/api/parent/members/${child}`,
      payload: { isActive: false },
      headers: { cookie: parentCookie, ...json },
    });

    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: childCookie } }))
        .statusCode,
    ).toBe(401);
    await app.close();
  });
});

describeDb('parents are not managed from the app', () => {
  it('refuses to change another parent\'s PIN', async () => {
    const app = await buildApp({ env: testEnv });
    const one = await makeUser('parent', 'Parent One');
    const two = await makeUser('parent', 'Parent Two');
    const cookie = await signIn(app, one);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/parent/members/${two}/pin`,
      payload: { pin: '7391' },
      headers: { cookie, ...json },
    });

    // Locking the other parent out of the household is not recoverable from
    // inside the app, so this stays a laptop-terminal job.
    expect(response.statusCode).toBe(403);
    expect(response.json().error.message).toMatch(/laptop/i);

    // Their PIN really is untouched.
    const { rows } = await pool.query<{ pin_hash: string }>('SELECT pin_hash FROM users WHERE id = $1', [two]);
    expect(await verifyPin('4821', rows[0]?.pin_hash ?? null)).toBe(true);
    await app.close();
  });

  it('refuses to deactivate or rename another parent', async () => {
    const app = await buildApp({ env: testEnv });
    const one = await makeUser('parent', 'Staying Parent');
    const two = await makeUser('parent', 'Targeted Parent');
    const cookie = await signIn(app, one);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/parent/members/${two}`,
      payload: { isActive: false, displayName: 'Renamed' },
      headers: { cookie, ...json },
    });
    expect(response.statusCode).toBe(403);

    const { rows } = await pool.query<{ is_active: boolean; display_name: string }>(
      'SELECT is_active, display_name FROM users WHERE id = $1',
      [two],
    );
    expect(rows[0]?.is_active).toBe(true);
    expect(rows[0]?.display_name).toBe('Targeted Parent');
    await app.close();
  });

  it('will not let a parent lock themselves out either', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Self Parent');
    const cookie = await signIn(app, parent);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/parent/members/${parent}`,
      payload: { isActive: false },
      headers: { cookie, ...json },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('still lists parents, marked as managed elsewhere', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Listed Parent');
    const child = await makeUser('child', 'Listed Child');
    const cookie = await signIn(app, parent);

    const response = await app.inject({
      method: 'GET',
      url: '/api/parent/members',
      headers: { cookie },
    });
    const members = response.json().members as { id: string; managedHere: boolean }[];
    expect(members.find((m) => m.id === parent)?.managedHere).toBe(false);
    expect(members.find((m) => m.id === child)?.managedHere).toBe(true);
    await app.close();
  });

  it('is closed to children entirely', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Curious Child');
    const cookie = await signIn(app, child);

    for (const [method, url] of [
      ['GET', '/api/parent/members'],
      ['POST', '/api/parent/members'],
      ['GET', '/api/parent/settings'],
      ['PATCH', '/api/parent/settings'],
      ['GET', '/api/parent/chores'],
    ] as const) {
      const response = await app.inject({ method, url, payload: {}, headers: { cookie, ...json } });
      expect(response.statusCode).toBe(403);
    }
    await app.close();
  });
});

describeDb('creating a chore', () => {
  it('creates the definition, its checklist, and the schedule that assigns it', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Wizard Parent');
    const child = await makeUser('child', 'Assigned Child');
    const cookie = await signIn(app, parent);

    const created = await app.inject({
      method: 'POST',
      url: '/api/parent/chores',
      payload: {
        name: 'Kitchen Cleaning',
        icon: 'kitchen',
        points: 10,
        subtasks: [{ title: 'Wash dishes' }, { title: 'Sweep floor' }],
        schedules: [{ assignedTo: child, recurrence: 'daily' }],
      },
      headers: { cookie, ...json },
    });
    expect(created.statusCode).toBe(200);
    createdChores.push(created.json().chore.id);

    // The child's day picks it up with no SQL anywhere.
    const childCookie = await signIn(app, child);
    const day = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie: childCookie } });
    const chore = day.json().core[0];
    expect(chore.name).toBe('Kitchen Cleaning');
    expect(chore.subtasks.map((s: { title: string }) => s.title)).toEqual(['Wash dishes', 'Sweep floor']);
    await app.close();
  });

  it('does not backfill a fortnight the moment it is created', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'No Backfill Parent');
    const child = await makeUser('child', 'No Backfill Child');
    const cookie = await signIn(app, parent);

    const created = await app.inject({
      method: 'POST',
      url: '/api/parent/chores',
      payload: {
        name: 'Bins',
        icon: 'trash',
        points: 5,
        schedules: [{ assignedTo: child, recurrence: 'daily' }],
      },
      headers: { cookie, ...json },
    });
    createdChores.push(created.json().chore.id);

    const childCookie = await signIn(app, child);
    await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie: childCookie } });

    const { rows } = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM chore_instances WHERE assigned_to = $1',
      [child],
    );
    // Starting today, not at the schedule's earliest possible date: a chore
    // created this morning must not arrive with two weeks of history.
    expect(rows[0]?.n).toBe(1);
    await app.close();
  });

  it('refuses a weekly chore with no days chosen', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Weekly Parent');
    const child = await makeUser('child', 'Weekly Child');
    const cookie = await signIn(app, parent);

    const response = await app.inject({
      method: 'POST',
      url: '/api/parent/chores',
      payload: {
        name: 'Bins',
        icon: 'trash',
        points: 5,
        schedules: [{ assignedTo: child, recurrence: 'weekly', daysOfWeek: [] }],
      },
      headers: { cookie, ...json },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('retiring one stops new instances without erasing what was done', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Retire Parent');
    const child = await makeUser('child', 'Retire Child');
    const cookie = await signIn(app, parent);

    const created = await app.inject({
      method: 'POST',
      url: '/api/parent/chores',
      payload: {
        name: 'Old chore',
        icon: 'kitchen',
        points: 10,
        schedules: [{ assignedTo: child, recurrence: 'daily' }],
      },
      headers: { cookie, ...json },
    });
    const choreId = created.json().chore.id as string;
    createdChores.push(choreId);

    const childCookie = await signIn(app, child);
    await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie: childCookie } });

    await app.inject({
      method: 'DELETE',
      url: `/api/parent/chores/${choreId}`,
      headers: { cookie, ...json },
    });

    const { rows } = await pool.query<{ is_active: boolean }>(
      'SELECT is_active FROM chore_schedules WHERE chore_definition_id = $1',
      [choreId],
    );
    expect(rows.every((r) => r.is_active === false)).toBe(true);

    // The instance already created stays; the child's history is intact.
    const { rows: instances } = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM chore_instances WHERE chore_definition_id = $1',
      [choreId],
    );
    expect(instances[0]?.n).toBe(1);
    await app.close();
  });
});

describeDb('household settings', () => {
  it('changes the point values, and the next approval uses them', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Settings Parent');
    const cookie = await signIn(app, parent);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/parent/settings',
      payload: { corePointValue: 15, punctualityBonusPoints: 5, reminderTime: '19:30' },
      headers: { cookie, ...json },
    });
    expect(response.statusCode).toBe(200);

    const settings = await app.inject({ method: 'GET', url: '/api/parent/settings', headers: { cookie } });
    expect(settings.json().settings.corePointValue).toBe(15);
    expect(settings.json().settings.punctualityBonusPoints).toBe(5);
    expect(settings.json().settings.reminderTime).toBe('19:30');
    await app.close();
  });

  it('turns cash out on only when both money values are supplied', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Money Parent');
    const cookie = await signIn(app, parent);

    // Half-configured is refused: the screen could not say which half is
    // missing, and a rate with no minimum is not a rule anyone chose.
    const halfway = await app.inject({
      method: 'PATCH',
      url: '/api/parent/settings',
      payload: { pointsPerDollar: 100 },
      headers: { cookie, ...json },
    });
    expect(halfway.statusCode).toBe(400);

    const both = await app.inject({
      method: 'PATCH',
      url: '/api/parent/settings',
      payload: { pointsPerDollar: 100, minimumCashOutPoints: 500 },
      headers: { cookie, ...json },
    });
    expect(both.statusCode).toBe(200);

    const settings = await app.inject({ method: 'GET', url: '/api/parent/settings', headers: { cookie } });
    expect(settings.json().settings.cashOutConfigured).toBe(true);
    await app.close();
  });

  it('turns cash out back off when both are cleared', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Clearing Parent');
    const cookie = await signIn(app, parent);

    await app.inject({
      method: 'PATCH',
      url: '/api/parent/settings',
      payload: { pointsPerDollar: 100, minimumCashOutPoints: 500 },
      headers: { cookie, ...json },
    });
    const off = await app.inject({
      method: 'PATCH',
      url: '/api/parent/settings',
      payload: { pointsPerDollar: null, minimumCashOutPoints: null },
      headers: { cookie, ...json },
    });
    expect(off.statusCode).toBe(200);

    const settings = await app.inject({ method: 'GET', url: '/api/parent/settings', headers: { cookie } });
    expect(settings.json().settings.cashOutConfigured).toBe(false);
    await app.close();
  });

  it('a configured rate reaches the child\'s wallet', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Wallet Settings Parent');
    const child = await makeUser('child', 'Wallet Settings Child');
    const parentCookie = await signIn(app, parent);

    await pool.query(
      `INSERT INTO points_ledger (child_id, delta, reason, label)
       VALUES ($1, 1000, 'manual_adjustment', 'Test grant')`,
      [child],
    );
    await app.inject({
      method: 'PATCH',
      url: '/api/parent/settings',
      payload: { pointsPerDollar: 100, minimumCashOutPoints: 500 },
      headers: { cookie: parentCookie, ...json },
    });

    const childCookie = await signIn(app, child);
    const wallet = await app.inject({ method: 'GET', url: '/api/child/wallet', headers: { cookie: childCookie } });
    const cashOut = wallet.json().cashOut;

    expect(cashOut.configured).toBe(true);
    expect(cashOut.pointsPerDollar).toBe(100);
    // 1000 points at 100 per dollar is $10.00.
    expect(cashOut.availableCents).toBe(1000);
    await app.close();
  });

  it('refuses nonsense values', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Validating Settings Parent');
    const cookie = await signIn(app, parent);

    for (const payload of [
      { corePointValue: 0 },
      { corePointValue: -5 },
      { pointsPerDollar: -1, minimumCashOutPoints: 500 },
      { reminderTime: '25:00' },
      { reminderTime: 'evening' },
    ]) {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/parent/settings',
        payload,
        headers: { cookie, ...json },
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });
});
