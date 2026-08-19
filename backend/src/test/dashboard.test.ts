/**
 * The parent dashboard, and closing out a chore nobody finished.
 *
 * The streak rules get the most attention. A child losing a fortnight's streak
 * because a parent was busy on a Tuesday is the failure this stage exists to
 * remove, so it is tested directly rather than reasoned about.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import '../pg-parsers.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { hashPin } from '../auth/pin.js';
import { SESSION_COOKIE } from '../auth/plugin.js';
import { addHouseholdDays, householdToday } from '../time.js';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

const TZ = 'America/Chicago';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '4009',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: TZ,
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

async function makeChoreDefinition(name = 'Kitchen Cleaning'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chore_definitions (name, icon, kind, points)
     VALUES ($1, 'kitchen', 'core', 10) RETURNING id`,
    [name],
  );
  const id = rows[0]?.id as string;
  createdChores.push(id);
  await pool.query(
    `INSERT INTO chore_subtask_templates (chore_definition_id, position, title)
     VALUES ($1, 0, 'Wash dishes')`,
    [id],
  );
  return id;
}

/** Places one chore on a given day in a given state, bypassing the schedule. */
async function placeChore(
  choreId: string,
  childId: string,
  date: string,
  status: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chore_instances (chore_definition_id, assigned_to, chore_date, points_value, status)
     VALUES ($1, $2, $3::date, 10, $4::chore_status) RETURNING id`,
    [choreId, childId, date, status],
  );
  return rows[0]?.id as string;
}

async function signIn(app: App, userId: string): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { userId, pin: '4821' },
  });
  const raw = login.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = list.find((entry) => entry.startsWith(`${SESSION_COOKIE}=`));
  if (!found) throw new Error('login failed');
  return found.split(';')[0] as string;
}

async function streakOf(app: App, childCookie: string): Promise<number> {
  const day = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie: childCookie } });
  return day.json().summary.streakDays;
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
});

afterAll(async () => {
  await pool?.end();
});

describeDb('an unresolved day never breaks a streak', () => {
  it('keeps the streak when a parent has simply not looked yet', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Unresolved Child');
    const chore = await makeChoreDefinition();
    const today = householdToday(TZ);

    // Three approved days, then one nobody finished and nobody decided about.
    await placeChore(chore, child, addHouseholdDays(today, -4), 'approved');
    await placeChore(chore, child, addHouseholdDays(today, -3), 'approved');
    await placeChore(chore, child, addHouseholdDays(today, -2), 'approved');
    await placeChore(chore, child, addHouseholdDays(today, -1), 'not_started');
    await placeChore(chore, child, today, 'approved');

    const cookie = await signIn(app, child);
    // Today counts, the unresolved day pauses, and the three before it carry
    // through: a busy parent costs the child nothing.
    expect(await streakOf(app, cookie)).toBe(4);
    await app.close();
  });

  it('breaks only once a parent actually says missed', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Decided Child');
    const parent = await makeUser('parent', 'Deciding Parent');
    const chore = await makeChoreDefinition();
    const today = householdToday(TZ);

    await placeChore(chore, child, addHouseholdDays(today, -2), 'approved');
    const yesterday = await placeChore(chore, child, addHouseholdDays(today, -1), 'not_started');
    await placeChore(chore, child, today, 'approved');

    const childCookie = await signIn(app, child);
    expect(await streakOf(app, childCookie)).toBe(2);

    const parentCookie = await signIn(app, parent);
    await app.inject({
      method: 'POST',
      url: `/api/parent/chores/${yesterday}/resolve`,
      payload: { outcome: 'missed' },
      headers: { cookie: parentCookie, ...json },
    });

    // Now it is a decision somebody made, and it counts.
    expect(await streakOf(app, childCookie)).toBe(1);
    await app.close();
  });

  it('an excused day pauses without ending the streak', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Excused Child');
    const parent = await makeUser('parent', 'Excusing Parent');
    const chore = await makeChoreDefinition();
    const today = householdToday(TZ);

    await placeChore(chore, child, addHouseholdDays(today, -2), 'approved');
    const sickDay = await placeChore(chore, child, addHouseholdDays(today, -1), 'not_started');
    await placeChore(chore, child, today, 'approved');

    const parentCookie = await signIn(app, parent);
    await app.inject({
      method: 'POST',
      url: `/api/parent/chores/${sickDay}/resolve`,
      payload: { outcome: 'excused' },
      headers: { cookie: parentCookie, ...json },
    });

    const childCookie = await signIn(app, child);
    // Two approved days either side of an excused one: the streak survives.
    expect(await streakOf(app, childCookie)).toBe(2);
    await app.close();
  });
});

describeDb('carrying a chore over', () => {
  it('closes the old day and puts a fresh copy on today', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Carry Child');
    const parent = await makeUser('parent', 'Carry Parent');
    const chore = await makeChoreDefinition();
    const today = householdToday(TZ);
    const yesterday = await placeChore(chore, child, addHouseholdDays(today, -1), 'in_progress');

    const parentCookie = await signIn(app, parent);
    const response = await app.inject({
      method: 'POST',
      url: `/api/parent/chores/${yesterday}/resolve`,
      payload: { outcome: 'carried_over' },
      headers: { cookie: parentCookie, ...json },
    });

    expect(response.statusCode).toBe(200);
    const carriedTo = response.json().result.carriedTo as string;
    expect(carriedTo).toBeTruthy();

    const { rows } = await pool.query<{ status: string; chore_date: string; carried_over_from: string | null }>(
      'SELECT status, chore_date::text AS chore_date, carried_over_from FROM chore_instances WHERE id = ANY($1::uuid[]) ORDER BY chore_date',
      [[yesterday, carriedTo]],
    );

    // Yesterday's record still says a chore was due that day.
    expect(rows[0]).toMatchObject({ status: 'carried_over' });
    expect(rows[1]).toMatchObject({ status: 'not_started', chore_date: today, carried_over_from: yesterday });

    // And it arrives on the child's list with a clean checklist.
    const childCookie = await signIn(app, child);
    const day = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie: childCookie } });
    const carried = day.json().core.find((c: { id: string }) => c.id === carriedTo);
    expect(carried.subtasks).toHaveLength(1);
    expect(carried.subtasks[0].done).toBe(false);
    await app.close();
  });

  it('does not duplicate a chore today already has', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Duplicate Child');
    const parent = await makeUser('parent', 'Duplicate Parent');
    const chore = await makeChoreDefinition();
    const today = householdToday(TZ);

    const yesterday = await placeChore(chore, child, addHouseholdDays(today, -1), 'not_started');
    await placeChore(chore, child, today, 'not_started');

    const parentCookie = await signIn(app, parent);
    const response = await app.inject({
      method: 'POST',
      url: `/api/parent/chores/${yesterday}/resolve`,
      payload: { outcome: 'carried_over' },
      headers: { cookie: parentCookie, ...json },
    });

    // Today's schedule already produced it; closing yesterday is still right,
    // but a second copy would be a second chore for the same day.
    expect(response.statusCode).toBe(200);
    expect(response.json().result.carriedTo).toBeNull();

    const { rows } = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM chore_instances WHERE assigned_to = $1 AND chore_date = $2::date',
      [child, today],
    );
    expect(rows[0]?.n).toBe(1);
    await app.close();
  });
});

describeDb('resolving is guarded', () => {
  it('refuses a chore already dealt with', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Done Child');
    const parent = await makeUser('parent', 'Done Parent');
    const chore = await makeChoreDefinition();
    const approved = await placeChore(chore, child, addHouseholdDays(householdToday(TZ), -1), 'approved');

    const cookie = await signIn(app, parent);
    const response = await app.inject({
      method: 'POST',
      url: `/api/parent/chores/${approved}/resolve`,
      payload: { outcome: 'missed' },
      headers: { cookie, ...json },
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('cannot be done twice', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Twice Resolved Child');
    const parent = await makeUser('parent', 'Twice Resolving Parent');
    const chore = await makeChoreDefinition();
    const yesterday = await placeChore(chore, child, addHouseholdDays(householdToday(TZ), -1), 'not_started');

    const cookie = await signIn(app, parent);
    const resolve = () =>
      app.inject({
        method: 'POST',
        url: `/api/parent/chores/${yesterday}/resolve`,
        payload: { outcome: 'excused' },
        headers: { cookie, ...json },
      });

    expect((await resolve()).statusCode).toBe(200);
    expect((await resolve()).statusCode).toBe(409);
    await app.close();
  });

  it('is closed to children', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Self Excusing Child');
    const chore = await makeChoreDefinition();
    const yesterday = await placeChore(chore, child, addHouseholdDays(householdToday(TZ), -1), 'not_started');

    const cookie = await signIn(app, child);
    const response = await app.inject({
      method: 'POST',
      url: `/api/parent/chores/${yesterday}/resolve`,
      payload: { outcome: 'excused' },
      headers: { cookie, ...json },
    });
    // Excusing your own chores would rather defeat the point.
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describeDb('the dashboard', () => {
  it('surfaces only unresolved past days, never today', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Attention Child');
    const parent = await makeUser('parent', 'Attention Parent');
    const chore = await makeChoreDefinition();
    const today = householdToday(TZ);

    const yesterday = await placeChore(chore, child, addHouseholdDays(today, -1), 'not_started');
    const todayId = await placeChore(chore, child, today, 'not_started');
    const oldApproved = await placeChore(chore, child, addHouseholdDays(today, -2), 'approved');

    const cookie = await signIn(app, parent);
    const response = await app.inject({ method: 'GET', url: '/api/parent/dashboard', headers: { cookie } });
    const ids = (response.json().needsAttention as { id: string }[]).map((item) => item.id);

    expect(ids).toContain(yesterday);
    // Today is still in progress; nagging about it would be wrong.
    expect(ids).not.toContain(todayId);
    expect(ids).not.toContain(oldApproved);
    await app.close();
  });

  it('counts what is waiting and what the week looks like', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Counted Child');
    const parent = await makeUser('parent', 'Counting Parent');
    const chore = await makeChoreDefinition();
    const today = householdToday(TZ);

    await placeChore(chore, child, today, 'submitted');

    const cookie = await signIn(app, parent);
    const response = await app.inject({ method: 'GET', url: '/api/parent/dashboard', headers: { cookie } });
    const body = response.json();

    expect(body.counts.pendingApprovals).toBeGreaterThanOrEqual(1);
    expect(body.children.map((c: { displayName: string }) => c.displayName)).toContain('Counted Child');
    expect(body.today).toBe(today);
    await app.close();
  });

  it('is closed to children', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Peeking Dashboard Child');
    const cookie = await signIn(app, child);

    expect((await app.inject({ method: 'GET', url: '/api/parent/dashboard' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/api/parent/dashboard', headers: { cookie } })).statusCode,
    ).toBe(403);
    await app.close();
  });
});
