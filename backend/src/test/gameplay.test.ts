/**
 * Boosts, the family goal, the newer badges, and the month leaderboard.
 *
 * The boost tests are about money as much as XP: a boost must double XP and
 * leave coins - the balance cash-out converts into dollars - exactly as they were.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import '../pg-parsers.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { hashPin } from '../auth/pin.js';
import { SESSION_COOKIE } from '../auth/plugin.js';
import { addHouseholdDays, householdToday, householdWeekStart } from '../time.js';
import { testConnectionString } from './database.js';
import { getPool } from '../db.js';
import { familyWeekXp } from '../chores/boosts.js';
import { releaseBonus } from '../chores/bonus.js';

const connectionString = testConnectionString;
const describeDb = connectionString ? describe : describe.skip;

const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '4009',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: 'America/Chicago',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: connectionString,
  SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
} as NodeJS.ProcessEnv);

type App = Awaited<ReturnType<typeof buildApp>>;

let pool: pg.Pool;
let app: App;
const createdUsers: string[] = [];
const createdDefinitions: string[] = [];
const today = householdToday('America/Chicago');

async function makeUser(role: 'parent' | 'child', name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (role, display_name, pin_hash, pin_set_at)
     VALUES ($1, $2, $3, now()) RETURNING id`,
    [role, name, await hashPin('4821')],
  );
  const id = rows[0]?.id as string;
  createdUsers.push(id);
  return id;
}

async function makeDefinition(name = 'Kitchen Cleaning'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chore_definitions (name, icon, kind, points) VALUES ($1, 'kitchen', 'core', 10) RETURNING id`,
    [name],
  );
  const id = rows[0]?.id as string;
  createdDefinitions.push(id);
  return id;
}

async function makeChore(
  childId: string,
  definitionId: string,
  date: string,
  status: string,
  extra: { punctual?: boolean; submittedAt?: string } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chore_instances (chore_definition_id, assigned_to, chore_date, status, points_value,
                                  points_awarded, submitted_punctual, submitted_at)
     VALUES ($1, $2, $3::date, $4::chore_status, 10, CASE WHEN $4::chore_status = 'approved' THEN 10 END, $5, $6)
     RETURNING id`,
    [definitionId, childId, date, status, extra.punctual ?? null, extra.submittedAt ?? null],
  );
  return rows[0]?.id as string;
}

/** A streak of `days` approved days ending yesterday, plus today's chore still open. */
async function streakOf(childId: string, days: number): Promise<string> {
  const definition = await makeDefinition();
  for (let back = 1; back <= days; back += 1) {
    await makeChore(childId, definition, addHouseholdDays(today, -back), 'approved');
  }
  return makeChore(childId, definition, today, 'not_started');
}

async function signIn(userId: string): Promise<string> {
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { userId, pin: '4821' } });
  const raw = login.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = list.find((entry) => entry.startsWith(`${SESSION_COOKIE}=`));
  if (!found) throw new Error('login did not set a session cookie');
  return found.split(';')[0] as string;
}

async function get(cookie: string, url: string) {
  const response = await app.inject({ method: 'GET', url, headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return response.json();
}

async function badge(cookie: string, code: string): Promise<{ progress: number; earnedAt: string | null }> {
  const { achievements } = await get(cookie, '/api/child/achievements');
  return achievements.find((entry: { code: string }) => entry.code === code);
}

beforeAll(async () => {
  if (!connectionString) return;
  pool = new pg.Pool({ connectionString, max: 4 });
  app = await buildApp({ env: testEnv });
});

afterEach(async () => {
  if (!connectionString) return;
  await pool.query('UPDATE household_settings SET weekly_xp_goal = NULL, weekly_goal_reward = NULL');
  if (createdUsers.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUsers]);
    createdUsers.length = 0;
  }
  if (createdDefinitions.length > 0) {
    await pool.query('DELETE FROM chore_instances WHERE chore_definition_id = ANY($1::uuid[])', [createdDefinitions]);
    await pool.query('DELETE FROM chore_definitions WHERE id = ANY($1::uuid[])', [createdDefinitions]);
    createdDefinitions.length = 0;
  }
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

describeDb('boosts', () => {
  it('doubles the XP of a boosted chore and leaves the coins exact', async () => {
    const child = await makeUser('child', 'Boost Child');
    const parent = await makeUser('parent', 'Boost Parent');
    const todayChore = await streakOf(child, 7);
    const kid = await signIn(child);

    const day = await get(kid, '/api/child/day');
    expect(day.summary.streakDays).toBe(7);
    expect(day.summary.boosts).toBe(1);

    const armed = await app.inject({ method: 'POST', url: `/api/chores/${todayChore}/boost`, headers: { cookie: kid } });
    expect(armed.statusCode).toBe(200);
    expect(armed.json().chore.boosted).toBe(true);
    expect((await get(kid, '/api/child/day')).summary.boosts).toBe(0);

    await pool.query(`UPDATE chore_instances SET status = 'submitted', submitted_at = now() WHERE id = $1`, [todayChore]);
    const approved = await app.inject({
      method: 'POST',
      url: `/api/parent/approvals/${todayChore}/approve`,
      headers: { cookie: await signIn(parent) },
    });
    expect(approved.statusCode).toBe(200);

    // Coins: exactly the one award row. XP: twice that.
    const { rows } = await pool.query('SELECT coalesce(sum(delta), 0)::int AS n FROM points_ledger WHERE child_id = $1', [child]);
    expect(rows[0].n).toBe(10);

    const wallet = await get(kid, '/api/child/wallet');
    expect(wallet.spendablePoints).toBe(10);
    expect(wallet.lifetimePoints).toBe(20);
    expect(wallet.history[0].delta).toBe(10);
    expect(wallet.history[0].boostXp).toBe(10);

    const after = await get(kid, '/api/child/day');
    expect(after.summary.spendablePoints).toBe(10);
    expect(after.summary.lifetimePoints).toBe(20);

    const board = await get(kid, '/api/child/leaderboard');
    const me = board.entries.find((entry: { id: string }) => entry.id === child);
    expect(me.lifetimePoints).toBe(20);
    expect(me.weekPoints).toBe(20);

    // An approved chore's boost is spent: it cannot be taken back off.
    const disarm = await app.inject({ method: 'DELETE', url: `/api/chores/${todayChore}/boost`, headers: { cookie: kid } });
    expect(disarm.statusCode).toBe(409);
  });

  it('grants one boost per multiple of seven, once per streak run', async () => {
    const child = await makeUser('child', 'Milestone Child');
    await streakOf(child, 14);
    const kid = await signIn(child);

    expect((await get(kid, '/api/child/day')).summary.boosts).toBe(2);
    // Asking again grants nothing more.
    expect((await get(kid, '/api/child/day')).summary.boosts).toBe(2);
    const { rows } = await pool.query('SELECT milestone FROM boosts WHERE child_id = $1 ORDER BY milestone', [child]);
    expect(rows.map((row) => row.milestone)).toEqual([7, 14]);
  });

  it('does not pay a milestone twice when the first day of the run is approved late', async () => {
    const child = await makeUser('child', 'Late Child');
    const definition = await makeDefinition();
    for (let back = 1; back <= 7; back += 1) {
      await makeChore(child, definition, addHouseholdDays(today, -back), 'approved');
    }
    const late = await makeChore(child, definition, addHouseholdDays(today, -8), 'submitted');
    await makeChore(child, definition, addHouseholdDays(today, -9), 'missed');
    await makeChore(child, definition, today, 'not_started');
    const kid = await signIn(child);
    expect((await get(kid, '/api/child/day')).summary.boosts).toBe(1);

    // The parent gets to the paused day last: the run now starts a day earlier.
    await pool.query(`UPDATE chore_instances SET status = 'approved', points_awarded = 10 WHERE id = $1`, [late]);
    expect((await get(kid, '/api/child/day')).summary.boosts).toBe(1);
  });

  it('hands the boost back when a boosted bonus chore is given back', async () => {
    const child = await makeUser('child', 'Bonus Child');
    await streakOf(child, 7);
    const kid = await signIn(child);
    await get(kid, '/api/child/day');
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO chore_definitions (name, icon, kind, points) VALUES ('Rake', 'leaf', 'bonus', 20) RETURNING id`,
    );
    createdDefinitions.push(rows[0]!.id);
    const bonus = await makeChore(child, rows[0]!.id, today, 'in_progress');

    const arm = await app.inject({ method: 'POST', url: `/api/chores/${bonus}/boost`, headers: { cookie: kid } });
    expect(arm.statusCode).toBe(200);
    await releaseBonus(pool, child, bonus);

    expect((await get(kid, '/api/child/day')).summary.boosts).toBe(1);
    const left = await pool.query('SELECT 1 FROM boosts WHERE chore_instance_id = $1', [bonus]);
    expect(left.rowCount).toBe(0);
  });

  it('does not count refunded or returned coins as XP', async () => {
    const child = await makeUser('child', 'Refund Child');
    for (const reason of ['reward_refunded', 'cash_out']) {
      await pool.query(
        `INSERT INTO points_ledger (child_id, delta, reason, label, created_by)
         VALUES ($1, 500, $2::ledger_reason, 'Returned', $1)`,
        [child, reason],
      );
    }
    const { rows } = await pool.query('SELECT coalesce(sum(xp), 0)::int AS xp FROM xp_ledger WHERE child_id = $1', [child]);
    expect(rows[0].xp).toBe(0);
  });

  it('gives nothing below seven days', async () => {
    const child = await makeUser('child', 'Short Child');
    await streakOf(child, 6);
    expect((await get(await signIn(child), '/api/child/day')).summary.boosts).toBe(0);
  });

  it('refuses to arm without a boost, twice, or on a decided chore, and can be taken off', async () => {
    const child = await makeUser('child', 'Arm Child');
    const todayChore = await streakOf(child, 7);
    const kid = await signIn(child);
    const definition = await makeDefinition('Laundry');
    const done = await makeChore(child, definition, addHouseholdDays(today, -1), 'approved');

    await get(kid, '/api/child/day');
    const arm = (id: string, method: 'POST' | 'DELETE' = 'POST') =>
      app.inject({ method, url: `/api/chores/${id}/boost`, headers: { cookie: kid } });

    expect((await arm(done)).statusCode).toBe(409);
    expect((await arm(todayChore)).statusCode).toBe(200);
    expect((await arm(todayChore)).statusCode).toBe(409);
    expect((await arm(todayChore, 'DELETE')).statusCode).toBe(200);
    expect((await get(kid, '/api/child/day')).summary.boosts).toBe(1);

    // Another child's chore is not found, not merely refused.
    const other = await makeUser('child', 'Other Child');
    const theirs = await makeChore(other, definition, today, 'not_started');
    expect((await arm(theirs)).statusCode).toBe(404);
  });
});

describeDb('the family goal', () => {
  it('shows progress and awards Team Player to everyone who contributed', async () => {
    const parent = await makeUser('parent', 'Goal Parent');
    const a = await makeUser('child', 'Goal A');
    const b = await makeUser('child', 'Goal B');
    const idle = await makeUser('child', 'Goal Idle');
    const [kidA, kidB, kidIdle] = [await signIn(a), await signIn(b), await signIn(idle)];

    expect((await get(kidA, '/api/child/day')).summary.familyGoal).toBeNull();

    // Whatever XP is already in this week's window belongs to the target too.
    const { total } = await familyWeekXp(getPool()!, householdWeekStart(today));
    const target = total + 20;
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/parent/settings',
      headers: { cookie: await signIn(parent) },
      payload: { weeklyXpGoal: target, weeklyGoalReward: 'Pizza night' },
    });
    expect(patch.statusCode).toBe(200);

    await pool.query(
      `INSERT INTO points_ledger (child_id, delta, reason, label) VALUES ($1, 10, 'manual_adjustment', 'Test')`,
      [a],
    );
    let goal = (await get(kidA, '/api/child/day')).summary.familyGoal;
    expect(goal).toMatchObject({ target, reward: 'Pizza night', xp: target - 10 });
    expect((await badge(kidA, 'team-player')).earnedAt).toBeNull();

    await pool.query(
      `INSERT INTO points_ledger (child_id, delta, reason, label) VALUES ($1, 10, 'manual_adjustment', 'Test')`,
      [b],
    );
    goal = (await get(kidB, '/api/child/day')).summary.familyGoal;
    expect(goal.xp).toBe(target);

    expect((await badge(kidA, 'team-player')).earnedAt).not.toBeNull();
    expect((await badge(kidB, 'team-player')).earnedAt).not.toBeNull();
    expect((await badge(kidIdle, 'team-player')).earnedAt).toBeNull();
  });
});

describeDb('household weeks', () => {
  // The database runs in UTC in production. Sunday 20:30 in Chicago is already
  // Monday in UTC, and it must still count toward the household's Sunday week.
  it('counts Sunday-evening XP toward that week, whatever the database clock says', async () => {
    const child = await makeUser('child', 'Sunday Evening');
    const thisWeek = householdWeekStart(today);
    const lastWeek = addHouseholdDays(thisWeek, -7);
    const lastSunday = addHouseholdDays(thisWeek, -1);
    await pool.query(
      `INSERT INTO points_ledger (child_id, delta, reason, label, created_at)
       VALUES ($1, 10, 'manual_adjustment', 'Test', ($2::date + time '20:30') AT TIME ZONE 'America/Chicago')`,
      [child, lastSunday],
    );

    expect((await familyWeekXp(getPool()!, lastWeek, child)).mine).toBe(10);
    expect((await familyWeekXp(getPool()!, thisWeek, child)).mine).toBe(0);
  });
});

describeDb('the newer badges', () => {
  it('perfect-week needs every day Monday to Sunday approved', async () => {
    const child = await makeUser('child', 'Perfect Child');
    const kid = await signIn(child);
    const definition = await makeDefinition();
    const lastMonday = addHouseholdDays(householdWeekStart(today), -7);
    const weekBefore = addHouseholdDays(lastMonday, -7);

    // The week before: six days only, so not perfect.
    for (let day = 0; day < 6; day += 1) await makeChore(child, definition, addHouseholdDays(weekBefore, day), 'approved');
    expect((await badge(kid, 'perfect-week')).earnedAt).toBeNull();

    for (let day = 0; day < 7; day += 1) await makeChore(child, definition, addHouseholdDays(lastMonday, day), 'approved');
    expect((await badge(kid, 'perfect-week')).earnedAt).not.toBeNull();
  });

  it('speed-run counts approved chores sent in two hours before the reminder', async () => {
    const child = await makeUser('child', 'Speed Child');
    const kid = await signIn(child);
    const definition = await makeDefinition();
    await pool.query(`UPDATE household_settings SET reminder_time = '20:45'`);

    // Noon in Chicago (17:00 or 18:00 UTC) on each chore's own day.
    for (let back = 1; back <= 9; back += 1) {
      const date = addHouseholdDays(today, -back);
      await makeChore(child, definition, date, 'approved', { punctual: true, submittedAt: `${date}T19:00:00Z` });
    }
    // On time, but only just: 20:30 Chicago is not a speed run.
    const late = addHouseholdDays(today, -10);
    await makeChore(child, definition, late, 'approved', { punctual: true, submittedAt: `${addHouseholdDays(late, 1)}T01:30:00Z` });
    expect(await badge(kid, 'speed-run')).toMatchObject({ progress: 9, earnedAt: null });

    const tenth = addHouseholdDays(today, -11);
    await makeChore(child, definition, tenth, 'approved', { punctual: true, submittedAt: `${tenth}T19:00:00Z` });
    expect((await badge(kid, 'speed-run')).earnedAt).not.toBeNull();
  });

  it('clean-sweep counts days of two or more chores, all on time and approved', async () => {
    const child = await makeUser('child', 'Sweep Child');
    const kid = await signIn(child);
    const first = await makeDefinition('Kitchen');
    const second = await makeDefinition('Bathroom');

    for (let back = 1; back <= 4; back += 1) {
      const date = addHouseholdDays(today, -back);
      await makeChore(child, first, date, 'approved', { punctual: true });
      await makeChore(child, second, date, 'approved', { punctual: true });
    }
    // One late chore spoils the day.
    const spoiled = addHouseholdDays(today, -5);
    await makeChore(child, first, spoiled, 'approved', { punctual: true });
    await makeChore(child, second, spoiled, 'approved', { punctual: false });
    expect(await badge(kid, 'clean-sweep')).toMatchObject({ progress: 4, earnedAt: null });

    const fifth = addHouseholdDays(today, -6);
    await makeChore(child, first, fifth, 'approved', { punctual: true });
    await makeChore(child, second, fifth, 'approved', { punctual: true });
    expect((await badge(kid, 'clean-sweep')).earnedAt).not.toBeNull();
  });
});

describeDb('the month leaderboard', () => {
  it('counts XP since the 1st of the household month', async () => {
    const child = await makeUser('child', 'Month Child');
    const kid = await signIn(child);
    const monthStart = `${today.slice(0, 7)}-01`;

    await pool.query(
      `INSERT INTO points_ledger (child_id, delta, reason, label, created_at)
       VALUES ($1, 7, 'manual_adjustment', 'This month', now()),
              ($1, 5, 'manual_adjustment', 'Last month', $2::date - interval '1 day')`,
      [child, monthStart],
    );

    const board = await get(kid, '/api/child/leaderboard');
    const me = board.entries.find((entry: { id: string }) => entry.id === child);
    expect(me.monthPoints).toBe(7);
    expect(me.lifetimePoints).toBe(12);
  });
});
