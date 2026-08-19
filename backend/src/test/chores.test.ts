/**
 * Chore materialisation and the child day API.
 *
 * The date helpers are pure and run everywhere. Everything else needs Postgres
 * and skips without it, as elsewhere.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import '../pg-parsers.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { hashPin } from '../auth/pin.js';
import { SESSION_COOKIE } from '../auth/plugin.js';
import { ensureDaysMaterialized, MAX_BACKFILL_DAYS } from '../chores/materialize.js';
import {
  addHouseholdDays,
  householdDaysBetween,
  householdWeekStart,
  isHouseholdDate,
  isoWeekdayFor,
} from '../time.js';

describe('household date arithmetic', () => {
  it('adds days as calendar dates, not as 24-hour blocks', () => {
    // The day after spring-forward Sunday in Chicago was only 23 hours long.
    // Doing this in local time is how that day repeats itself.
    expect(addHouseholdDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addHouseholdDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addHouseholdDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addHouseholdDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addHouseholdDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('counts whole days between dates in both directions', () => {
    expect(householdDaysBetween('2026-08-19', '2026-08-19')).toBe(0);
    expect(householdDaysBetween('2026-08-19', '2026-08-22')).toBe(3);
    expect(householdDaysBetween('2026-08-22', '2026-08-19')).toBe(-3);
    // Spans a DST change; still three calendar days.
    expect(householdDaysBetween('2026-03-07', '2026-03-10')).toBe(3);
  });

  it('uses ISO weekday numbering, matching days_of_week', () => {
    expect(isoWeekdayFor('2026-08-17')).toBe(1); // Monday
    expect(isoWeekdayFor('2026-08-23')).toBe(7); // Sunday
  });

  it('finds the Monday a date belongs to', () => {
    expect(householdWeekStart('2026-08-19')).toBe('2026-08-17');
    expect(householdWeekStart('2026-08-17')).toBe('2026-08-17');
    expect(householdWeekStart('2026-08-23')).toBe('2026-08-17');
  });

  it('rejects dates that do not exist', () => {
    expect(isHouseholdDate('2026-08-19')).toBe(true);
    expect(isHouseholdDate('2026-02-30')).toBe(false);
    expect(isHouseholdDate('2026-13-01')).toBe(false);
    expect(isHouseholdDate('19-08-2026')).toBe(false);
    expect(isHouseholdDate('')).toBe(false);
  });
});

// --- Needs a database --------------------------------------------------------

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '4003',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: 'America/Chicago',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: connectionString,
  SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
} as NodeJS.ProcessEnv);

let pool: pg.Pool;
const createdUsers: string[] = [];
const createdChores: string[] = [];

/**
 * Backdated by default. Backfill never reaches earlier than the day a child was
 * added, so a child created this instant could only ever have today's chores -
 * and the tests below work with fixed dates in the past.
 */
async function makeChild(name: string, options: { joinedDaysAgo?: number } = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (role, display_name, pin_hash, pin_set_at, created_at)
     VALUES ('child', $1, $2, now(), now() - make_interval(days => $3)) RETURNING id`,
    [name, await hashPin('4821'), options.joinedDaysAgo ?? 900],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('failed to create child');
  createdUsers.push(id);
  return id;
}

async function makeChore(
  name: string,
  options: { kind?: 'core' | 'bonus'; points?: number; subtasks?: string[] } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chore_definitions (name, icon, kind, points)
     VALUES ($1, 'kitchen', $2, $3) RETURNING id`,
    [name, options.kind ?? 'core', options.points ?? 10],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('failed to create chore');
  createdChores.push(id);

  for (const [index, title] of (options.subtasks ?? []).entries()) {
    await pool.query(
      `INSERT INTO chore_subtask_templates (chore_definition_id, position, title)
       VALUES ($1, $2, $3)`,
      [id, index, title],
    );
  }
  return id;
}

async function schedule(
  choreId: string,
  childId: string,
  options: { recurrence?: 'daily' | 'weekly'; days?: number[]; startsOn?: string } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO chore_schedules
       (chore_definition_id, assigned_to, recurrence, days_of_week, starts_on)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      choreId,
      childId,
      options.recurrence ?? 'daily',
      options.days ?? [],
      options.startsOn ?? '2020-01-01',
    ],
  );
}

async function signIn(app: Awaited<ReturnType<typeof buildApp>>, childId: string): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { userId: childId, pin: '4821' },
  });
  const raw = login.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = list.find((entry) => entry.startsWith(`${SESSION_COOKIE}=`));
  if (!found) throw new Error('login did not set a session cookie');
  return found.split(';')[0] as string;
}

beforeAll(() => {
  if (connectionString) pool = new pg.Pool({ connectionString, max: 4 });
});

afterEach(async () => {
  if (createdUsers.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUsers]);
    createdUsers.length = 0;
  }
  if (createdChores.length > 0) {
    await pool.query('DELETE FROM chore_instances WHERE chore_definition_id = ANY($1::uuid[])', [createdChores]);
    await pool.query('DELETE FROM chore_definitions WHERE id = ANY($1::uuid[])', [createdChores]);
    createdChores.length = 0;
  }
});

afterAll(async () => {
  await pool?.end();
});

describeDb('materialisation', () => {
  it('creates a daily chore with its checklist copied in', async () => {
    const child = await makeChild('Materialise Child');
    const chore = await makeChore('Kitchen', { subtasks: ['Wash dishes', 'Sweep floor'] });
    await schedule(chore, child);

    const result = await ensureDaysMaterialized(pool, child, '2026-08-19', { backfillDays: 0 });
    expect(result.choresCreated).toBe(1);

    const { rows } = await pool.query(
      `SELECT s.title, s.done FROM chore_instance_subtasks s
         JOIN chore_instances ci ON ci.id = s.chore_instance_id
        WHERE ci.assigned_to = $1 ORDER BY s.position`,
      [child],
    );
    expect(rows.map((r) => r.title)).toEqual(['Wash dishes', 'Sweep floor']);
    expect(rows.every((r) => r.done === false)).toBe(true);
  });

  it('is idempotent, so reading twice does not double the day', async () => {
    const child = await makeChild('Idempotent Child');
    const chore = await makeChore('Kitchen', { subtasks: ['Wash dishes'] });
    await schedule(chore, child);

    await ensureDaysMaterialized(pool, child, '2026-08-19', { backfillDays: 0 });
    const second = await ensureDaysMaterialized(pool, child, '2026-08-19', { backfillDays: 0 });

    expect(second.choresCreated).toBe(0);
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM chore_instances WHERE assigned_to = $1',
      [child],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('survives two requests materialising the same day at once', async () => {
    const child = await makeChild('Concurrent Child');
    const chore = await makeChore('Kitchen', { subtasks: ['Wash dishes'] });
    await schedule(chore, child);

    // Two tabs opening the app together is not a rare event on a shared tablet.
    await Promise.all([
      ensureDaysMaterialized(pool, child, '2026-08-19', { backfillDays: 0 }),
      ensureDaysMaterialized(pool, child, '2026-08-19', { backfillDays: 0 }),
    ]);

    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM chore_instances WHERE assigned_to = $1',
      [child],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('only creates a weekly chore on its chosen days', async () => {
    const child = await makeChild('Weekly Child');
    // Mondays and Fridays.
    const chore = await makeChore('Bins');
    await schedule(chore, child, { recurrence: 'weekly', days: [1, 5] });

    await ensureDaysMaterialized(pool, child, '2026-08-17', { backfillDays: 0 }); // Monday
    await ensureDaysMaterialized(pool, child, '2026-08-18', { backfillDays: 0 }); // Tuesday
    await ensureDaysMaterialized(pool, child, '2026-08-21', { backfillDays: 0 }); // Friday

    const { rows } = await pool.query<{ chore_date: string }>(
      'SELECT chore_date::text FROM chore_instances WHERE assigned_to = $1 ORDER BY chore_date',
      [child],
    );
    expect(rows.map((r) => r.chore_date)).toEqual(['2026-08-17', '2026-08-21']);
  });

  it('fills in days missed while the laptop was off', async () => {
    const child = await makeChild('Holiday Child');
    const chore = await makeChore('Kitchen');
    await schedule(chore, child);

    // Someone opened the app three days ago, then nobody did.
    await ensureDaysMaterialized(pool, child, '2026-08-16', { backfillDays: 0 });
    await ensureDaysMaterialized(pool, child, '2026-08-19');

    const { rows } = await pool.query<{ chore_date: string }>(
      'SELECT chore_date::text FROM chore_instances WHERE assigned_to = $1 ORDER BY chore_date',
      [child],
    );
    expect(rows.map((r) => r.chore_date)).toEqual([
      '2026-08-16',
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
    ]);
  });

  it('does not backfill further than the limit', async () => {
    const child = await makeChild('Long Absence Child');
    const chore = await makeChore('Kitchen');
    await schedule(chore, child);

    await ensureDaysMaterialized(pool, child, '2026-08-19');

    const { rows } = await pool.query<{ n: number; earliest: string }>(
      `SELECT count(*)::int AS n, min(chore_date)::text AS earliest
         FROM chore_instances WHERE assigned_to = $1`,
      [child],
    );
    // Burying the approval queue in months of stale chores helps nobody.
    expect(rows[0]?.n).toBe(MAX_BACKFILL_DAYS + 1);
    expect(rows[0]?.earliest).toBe(addHouseholdDays('2026-08-19', -MAX_BACKFILL_DAYS));
  });

  it('gives a newly added child no backdated chores', async () => {
    // A parent writing down chores the family already does will naturally set a
    // start date in the past. That must not hand a child who joined this morning
    // two weeks of chores they never had the chance to do.
    const child = await makeChild('Brand New Child', { joinedDaysAgo: 0 });
    const chore = await makeChore('Kitchen');
    await schedule(chore, child, { startsOn: '2020-01-01' });

    const today = new Date().toISOString().slice(0, 10);
    await ensureDaysMaterialized(pool, child, today);

    const { rows } = await pool.query<{ n: number; earliest: string }>(
      `SELECT count(*)::int AS n, min(chore_date)::text AS earliest
         FROM chore_instances WHERE assigned_to = $1`,
      [child],
    );
    expect(rows[0]?.n).toBe(1);
    expect(rows[0]?.earliest).toBe(today);
  });

  it('ignores schedules that have not started or have ended', async () => {
    const child = await makeChild('Window Child');
    const future = await makeChore('Future');
    const ended = await makeChore('Ended');
    await schedule(future, child, { startsOn: '2027-01-01' });
    await pool.query(
      `INSERT INTO chore_schedules (chore_definition_id, assigned_to, recurrence, starts_on, ends_on)
       VALUES ($1, $2, 'daily', '2020-01-01', '2026-08-18')`,
      [ended, child],
    );

    const result = await ensureDaysMaterialized(pool, child, '2026-08-19', { backfillDays: 0 });
    expect(result.choresCreated).toBe(0);
  });

  it('leaves an inactive chore out entirely', async () => {
    const child = await makeChild('Inactive Child');
    const chore = await makeChore('Retired');
    await schedule(chore, child);
    await pool.query('UPDATE chore_definitions SET is_active = false WHERE id = $1', [chore]);

    const result = await ensureDaysMaterialized(pool, child, '2026-08-19', { backfillDays: 0 });
    expect(result.choresCreated).toBe(0);
  });
});

describeDb('GET /api/child/day', () => {
  it('returns the day with its checklist and totals', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeChild('Day Child');
    const chore = await makeChore('Kitchen', { subtasks: ['Wash dishes', 'Sweep floor'] });
    await schedule(chore, child);
    const cookie = await signIn(app, child);

    const response = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie } });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.core).toHaveLength(1);
    expect(body.core[0].name).toBe('Kitchen');
    expect(body.core[0].subtasks.map((s: { title: string }) => s.title)).toEqual([
      'Wash dishes',
      'Sweep floor',
    ]);
    expect(body.summary.spendablePoints).toBe(0);
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await app.close();
  });

  it('refuses anyone who is not signed in, and any parent', async () => {
    const app = await buildApp({ env: testEnv });

    const anonymous = await app.inject({ method: 'GET', url: '/api/child/day' });
    expect(anonymous.statusCode).toBe(401);

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (role, display_name, pin_hash, pin_set_at)
       VALUES ('parent', 'Day Parent', $1, now()) RETURNING id`,
      [await hashPin('4821')],
    );
    const parentId = rows[0]?.id as string;
    createdUsers.push(parentId);
    const cookie = await signIn(app, parentId);

    const asParent = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie } });
    expect(asParent.statusCode).toBe(403);
    await app.close();
  });

  it('refuses a day that has not happened yet', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeChild('Future Child');
    const cookie = await signIn(app, child);

    const response = await app.inject({
      method: 'GET',
      url: '/api/child/day?date=2099-01-01',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('refuses a date that is not a date', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeChild('Bad Date Child');
    const cookie = await signIn(app, child);

    for (const date of ['2026-02-30', 'yesterday', '2026-8-1']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/child/day?date=${encodeURIComponent(date)}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });
});

describeDb('ticking a subtask', () => {
  it('persists, and moves the chore into progress', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeChild('Tick Child');
    const chore = await makeChore('Kitchen', { subtasks: ['Wash dishes', 'Sweep floor'] });
    await schedule(chore, child);
    const cookie = await signIn(app, child);

    const day = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie } });
    const instance = day.json().core[0];
    expect(instance.status).toBe('not_started');

    const ticked = await app.inject({
      method: 'PATCH',
      url: `/api/chores/${instance.id}/subtasks/${instance.subtasks[0].id}`,
      payload: { done: true },
      headers: { cookie },
    });

    expect(ticked.statusCode).toBe(200);
    expect(ticked.json().chore.status).toBe('in_progress');
    expect(ticked.json().chore.subtasks[0].done).toBe(true);
    await app.close();
  });

  it('goes back to not started when the last tick is undone', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeChild('Untick Child');
    const chore = await makeChore('Kitchen', { subtasks: ['Wash dishes'] });
    await schedule(chore, child);
    const cookie = await signIn(app, child);

    const day = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie } });
    const instance = day.json().core[0];
    const url = `/api/chores/${instance.id}/subtasks/${instance.subtasks[0].id}`;

    await app.inject({ method: 'PATCH', url, payload: { done: true }, headers: { cookie } });
    const undone = await app.inject({ method: 'PATCH', url, payload: { done: false }, headers: { cookie } });

    expect(undone.json().chore.status).toBe('not_started');
    expect(undone.json().chore.subtasks[0].done).toBe(false);
    await app.close();
  });

  it('will not let one child tick another child\'s chore', async () => {
    const app = await buildApp({ env: testEnv });
    const mine = await makeChild('Owner Child');
    const theirs = await makeChild('Sibling Child');
    const chore = await makeChore('Kitchen', { subtasks: ['Wash dishes'] });
    await schedule(chore, theirs);

    const siblingCookie = await signIn(app, theirs);
    const day = await app.inject({
      method: 'GET',
      url: '/api/child/day',
      headers: { cookie: siblingCookie },
    });
    const instance = day.json().core[0];

    const myCookie = await signIn(app, mine);
    const attempt = await app.inject({
      method: 'PATCH',
      url: `/api/chores/${instance.id}/subtasks/${instance.subtasks[0].id}`,
      payload: { done: true },
      headers: { cookie: myCookie },
    });

    expect(attempt.statusCode).toBe(404);

    // And it really did not change.
    const { rows } = await pool.query('SELECT done FROM chore_instance_subtasks WHERE id = $1', [
      instance.subtasks[0].id,
    ]);
    expect(rows[0]?.done).toBe(false);
    await app.close();
  });

  it('will not reopen a chore that has been approved', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeChild('Approved Child');
    const chore = await makeChore('Kitchen', { subtasks: ['Wash dishes'] });
    await schedule(chore, child);
    const cookie = await signIn(app, child);

    const day = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie } });
    const instance = day.json().core[0];
    await pool.query(`UPDATE chore_instances SET status = 'approved' WHERE id = $1`, [instance.id]);

    const attempt = await app.inject({
      method: 'PATCH',
      url: `/api/chores/${instance.id}/subtasks/${instance.subtasks[0].id}`,
      payload: { done: true },
      headers: { cookie },
    });
    // Reopening a finished chore is a parent action, not a child's untick.
    expect(attempt.statusCode).toBe(404);
    await app.close();
  });

  it('lets a rejected chore be worked on again', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeChild('Rejected Child');
    const chore = await makeChore('Bathroom', { subtasks: ['Clean mirror'] });
    await schedule(chore, child);
    const cookie = await signIn(app, child);

    const day = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie } });
    const instance = day.json().core[0];
    await pool.query(
      `UPDATE chore_instances SET status = 'rejected', rejection_note = 'Mirror still has spots.'
        WHERE id = $1`,
      [instance.id],
    );

    const ticked = await app.inject({
      method: 'PATCH',
      url: `/api/chores/${instance.id}/subtasks/${instance.subtasks[0].id}`,
      payload: { done: true },
      headers: { cookie },
    });
    expect(ticked.statusCode).toBe(200);
    expect(ticked.json().chore.subtasks[0].done).toBe(true);
    await app.close();
  });
});

describeDb('GET /api/chores/:id', () => {
  it('hides another child\'s chore behind a 404', async () => {
    const app = await buildApp({ env: testEnv });
    const mine = await makeChild('Peeker Child');
    const theirs = await makeChild('Private Child');
    const chore = await makeChore('Kitchen', { subtasks: ['Wash dishes'] });
    await schedule(chore, theirs);

    const siblingCookie = await signIn(app, theirs);
    const day = await app.inject({
      method: 'GET',
      url: '/api/child/day',
      headers: { cookie: siblingCookie },
    });
    const instance = day.json().core[0];

    const myCookie = await signIn(app, mine);
    const response = await app.inject({
      method: 'GET',
      url: `/api/chores/${instance.id}`,
      headers: { cookie: myCookie },
    });
    // 404, not 403: guessing an id should not even confirm the chore exists.
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
