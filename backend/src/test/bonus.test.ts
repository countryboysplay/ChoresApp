/**
 * Bonus chores: posting, claiming, giving back, and expiry.
 *
 * Claiming is a race between siblings, and the household rules exist to stop one
 * child locking the board. Both get explicit tests.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import '../pg-parsers.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { hashPin } from '../auth/pin.js';
import { SESSION_COOKIE } from '../auth/plugin.js';
import { releaseExpiredClaims } from '../chores/bonus.js';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '4007',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: 'America/Chicago',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: connectionString,
  SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
} as NodeJS.ProcessEnv);

let pool: pg.Pool;
const createdUsers: string[] = [];
const createdDefinitions: string[] = [];

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

async function signIn(app: App, userId: string): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { userId, pin: '4821' },
  });
  const raw = login.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = list.find((entry) => entry.startsWith(`${SESSION_COOKIE}=`));
  if (!found) throw new Error('login did not set a session cookie');
  return found.split(';')[0] as string;
}

/** Posts a bonus chore to the board and returns its instance id. */
async function postBonus(
  app: App,
  parentCookie: string,
  options: { name?: string; points?: number; expiresInMinutes?: number | null; subtasks?: string[] } = {},
): Promise<string> {
  const expiresAt =
    options.expiresInMinutes === null || options.expiresInMinutes === undefined
      ? null
      : new Date(Date.now() + options.expiresInMinutes * 60_000).toISOString();

  const response = await app.inject({
    method: 'POST',
    url: '/api/parent/bonus',
    payload: {
      name: options.name ?? 'Sweep the garage',
      icon: 'floors',
      points: options.points ?? 25,
      category: 'Yard',
      subtasks: options.subtasks ?? ['Sweep front to back'],
      expiresAt,
    },
    headers: { cookie: parentCookie, ...json },
  });
  if (response.statusCode !== 200) throw new Error(`post failed: ${response.body}`);
  createdDefinitions.push(response.json().bonus.definitionId);
  return response.json().bonus.id;
}

async function stateOf(instanceId: string) {
  const { rows } = await pool.query<{ assigned_to: string | null; status: string }>(
    'SELECT assigned_to, status FROM chore_instances WHERE id = $1',
    [instanceId],
  );
  return rows[0];
}

beforeAll(() => {
  if (connectionString) pool = new pg.Pool({ connectionString, max: 6 });
});

afterEach(async () => {
  if (createdDefinitions.length > 0) {
    await pool.query('DELETE FROM chore_instances WHERE chore_definition_id = ANY($1::uuid[])', [createdDefinitions]);
    await pool.query('DELETE FROM chore_definitions WHERE id = ANY($1::uuid[])', [createdDefinitions]);
    createdDefinitions.length = 0;
  }
  if (createdUsers.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUsers]);
    createdUsers.length = 0;
  }
});

afterAll(async () => {
  await pool?.end();
});

describeDb('posting to the board', () => {
  it('creates an unclaimed chore with its checklist, visible to every child', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Bonus Parent');
    const one = await makeUser('child', 'Bonus Child One');
    const two = await makeUser('child', 'Bonus Child Two');

    const parentCookie = await signIn(app, parent);
    const instanceId = await postBonus(app, parentCookie, {
      subtasks: ['Move loose items', 'Sweep front to back'],
    });

    expect((await stateOf(instanceId))?.assigned_to).toBeNull();

    // Both children see the same chore on offer.
    for (const child of [one, two]) {
      const cookie = await signIn(app, child);
      const day = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie } });
      const offered = day.json().availableBonus.find((b: { id: string }) => b.id === instanceId);
      expect(offered).toBeDefined();
      expect(offered.subtasks).toHaveLength(2);
    }
    await app.close();
  });

  it('is closed to children', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Posting Child');
    const cookie = await signIn(app, child);

    const response = await app.inject({
      method: 'POST',
      url: '/api/parent/bonus',
      payload: { name: 'Free points', icon: 'star', points: 9999 },
      headers: { cookie, ...json },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describeDb('claiming', () => {
  it('gives it to the child who claims, and takes it off the board', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Claim Parent');
    const child = await makeUser('child', 'Claim Child');
    const other = await makeUser('child', 'Other Child');

    const instanceId = await postBonus(app, await signIn(app, parent), { expiresInMinutes: 120 });
    const cookie = await signIn(app, child);

    const claim = await app.inject({
      method: 'POST',
      url: `/api/bonus/${instanceId}/claim`,
      headers: { cookie, ...json },
    });
    expect(claim.statusCode).toBe(200);
    expect((await stateOf(instanceId))?.assigned_to).toBe(child);

    // It is now on the claimer's own list and off everyone else's board.
    const mine = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie } });
    expect(mine.json().bonus.map((b: { id: string }) => b.id)).toContain(instanceId);
    expect(mine.json().availableBonus.map((b: { id: string }) => b.id)).not.toContain(instanceId);

    const otherCookie = await signIn(app, other);
    const theirs = await app.inject({
      method: 'GET',
      url: '/api/child/day',
      headers: { cookie: otherCookie },
    });
    expect(theirs.json().availableBonus.map((b: { id: string }) => b.id)).not.toContain(instanceId);
    await app.close();
  });

  it('gives it to exactly one of two siblings racing for it', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Race Bonus Parent');
    const one = await makeUser('child', 'Racer One');
    const two = await makeUser('child', 'Racer Two');

    const instanceId = await postBonus(app, await signIn(app, parent), { expiresInMinutes: 120 });
    const oneCookie = await signIn(app, one);
    const twoCookie = await signIn(app, two);

    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/bonus/${instanceId}/claim`, headers: { cookie: oneCookie, ...json } }),
      app.inject({ method: 'POST', url: `/api/bonus/${instanceId}/claim`, headers: { cookie: twoCookie, ...json } }),
    ]);

    // One winner, and the loser is told plainly rather than both being told yes.
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const state = await stateOf(instanceId);
    expect([one, two]).toContain(state?.assigned_to);
    await app.close();
  });

  it('refuses a second claim while one is still unfinished', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Hoard Parent');
    const child = await makeUser('child', 'Hoarding Child');
    const parentCookie = await signIn(app, parent);

    const first = await postBonus(app, parentCookie, { name: 'Sweep the garage', expiresInMinutes: 120 });
    const second = await postBonus(app, parentCookie, { name: 'Rake the yard', expiresInMinutes: 120 });
    const cookie = await signIn(app, child);

    expect(
      (await app.inject({ method: 'POST', url: `/api/bonus/${first}/claim`, headers: { cookie, ...json } }))
        .statusCode,
    ).toBe(200);

    // This is the rule that stops one child claiming the whole board.
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/bonus/${second}/claim`,
      headers: { cookie, ...json },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.message).toMatch(/finish or give back/i);
    expect((await stateOf(second))?.assigned_to).toBeNull();
    await app.close();
  });

  it('refuses a chore whose deadline has passed', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Expiry Parent');
    const child = await makeUser('child', 'Late Child');

    const instanceId = await postBonus(app, await signIn(app, parent), { expiresInMinutes: 120 });
    await pool.query(`UPDATE chore_instances SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
      instanceId,
    ]);

    const cookie = await signIn(app, child);
    const response = await app.inject({
      method: 'POST',
      url: `/api/bonus/${instanceId}/claim`,
      headers: { cookie, ...json },
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });
});

describeDb('giving one back', () => {
  it('returns it to the board and clears the checklist', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Release Parent');
    const child = await makeUser('child', 'Releasing Child');

    const instanceId = await postBonus(app, await signIn(app, parent), { expiresInMinutes: 120 });
    const cookie = await signIn(app, child);
    await app.inject({ method: 'POST', url: `/api/bonus/${instanceId}/claim`, headers: { cookie, ...json } });

    // Tick a step, so there is progress to discard.
    const detail = await app.inject({ method: 'GET', url: `/api/chores/${instanceId}`, headers: { cookie } });
    const subtaskId = detail.json().chore.subtasks[0].id;
    await app.inject({
      method: 'PATCH',
      url: `/api/chores/${instanceId}/subtasks/${subtaskId}`,
      payload: { done: true },
      headers: { cookie, ...json },
    });

    const released = await app.inject({
      method: 'POST',
      url: `/api/bonus/${instanceId}/release`,
      headers: { cookie, ...json },
    });
    expect(released.statusCode).toBe(200);

    const state = await stateOf(instanceId);
    expect(state?.assigned_to).toBeNull();
    expect(state?.status).toBe('not_started');

    // Whoever takes it next starts clean.
    const { rows } = await pool.query<{ done: boolean }>(
      'SELECT done FROM chore_instance_subtasks WHERE chore_instance_id = $1',
      [instanceId],
    );
    expect(rows.every((r) => r.done === false)).toBe(true);

    // And having given it back, they can claim something else.
    const another = await postBonus(app, await signIn(app, parent), { name: 'Wash the car' });
    expect(
      (await app.inject({ method: 'POST', url: `/api/bonus/${another}/claim`, headers: { cookie, ...json } }))
        .statusCode,
    ).toBe(200);
    await app.close();
  });

  it('will not let a child give back someone else\'s claim', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Interfere Parent');
    const owner = await makeUser('child', 'Owning Child');
    const meddler = await makeUser('child', 'Meddling Child');

    const instanceId = await postBonus(app, await signIn(app, parent), { expiresInMinutes: 120 });
    const ownerCookie = await signIn(app, owner);
    await app.inject({ method: 'POST', url: `/api/bonus/${instanceId}/claim`, headers: { cookie: ownerCookie, ...json } });

    const meddlerCookie = await signIn(app, meddler);
    const response = await app.inject({
      method: 'POST',
      url: `/api/bonus/${instanceId}/release`,
      headers: { cookie: meddlerCookie, ...json },
    });
    expect(response.statusCode).toBe(404);
    expect((await stateOf(instanceId))?.assigned_to).toBe(owner);
    await app.close();
  });
});

describeDb('expiry', () => {
  it('puts a lapsed claim back on the board with no penalty', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Lapse Parent');
    const child = await makeUser('child', 'Lapsing Child');
    const sibling = await makeUser('child', 'Waiting Child');

    const instanceId = await postBonus(app, await signIn(app, parent), { expiresInMinutes: 60 });
    const cookie = await signIn(app, child);
    await app.inject({ method: 'POST', url: `/api/bonus/${instanceId}/claim`, headers: { cookie, ...json } });

    await pool.query(`UPDATE chore_instances SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
      instanceId,
    ]);

    const released = await releaseExpiredClaims(pool);
    expect(released).toBe(1);

    const state = await stateOf(instanceId);
    expect(state?.assigned_to).toBeNull();
    // No penalty and no missed status - the work still needs doing.
    expect(state?.status).toBe('not_started');

    // And genuinely claimable again. Returning it with an expiry already in the
    // past would leave it on nobody's board, which is the blocking this rule
    // exists to prevent.
    const siblingCookie = await signIn(app, sibling);
    const board = await app.inject({
      method: 'GET',
      url: '/api/child/day',
      headers: { cookie: siblingCookie },
    });
    expect(board.json().availableBonus.map((b: { id: string }) => b.id)).toContain(instanceId);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/bonus/${instanceId}/claim`,
          headers: { cookie: siblingCookie, ...json },
        })
      ).statusCode,
    ).toBe(200);

    // Having lost it, the original child is free to claim again.
    const another = await postBonus(app, await signIn(app, parent), { name: 'Wash the car' });
    expect(
      (await app.inject({ method: 'POST', url: `/api/bonus/${another}/claim`, headers: { cookie, ...json } }))
        .statusCode,
    ).toBe(200);

    await app.close();
  });

  it('never takes back a chore that was actually done', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Submitted Parent');
    const child = await makeUser('child', 'Submitted Child');

    const instanceId = await postBonus(app, await signIn(app, parent), { expiresInMinutes: 60 });
    const cookie = await signIn(app, child);
    await app.inject({ method: 'POST', url: `/api/bonus/${instanceId}/claim`, headers: { cookie, ...json } });

    // Pretend it was completed and sent in before the deadline.
    await pool.query(
      `UPDATE chore_instances
          SET status = 'submitted', submitted_at = now(), expires_at = now() - interval '1 minute'
        WHERE id = $1`,
      [instanceId],
    );

    expect(await releaseExpiredClaims(pool)).toBe(0);
    const state = await stateOf(instanceId);
    // It is waiting on a parent, not on the child.
    expect(state?.assigned_to).toBe(child);
    expect(state?.status).toBe('submitted');
    await app.close();
  });

  it('stops offering an unclaimed chore once it lapses', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Offer Parent');
    const child = await makeUser('child', 'Offer Child');

    const instanceId = await postBonus(app, await signIn(app, parent), { expiresInMinutes: 60 });
    await pool.query(`UPDATE chore_instances SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
      instanceId,
    ]);

    const cookie = await signIn(app, child);
    const day = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie } });
    expect(day.json().availableBonus.map((b: { id: string }) => b.id)).not.toContain(instanceId);
    await app.close();
  });
});

describeDb('taking one off the board', () => {
  it('is refused while a child is working on it', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Withdraw Parent');
    const child = await makeUser('child', 'Working Child');

    const parentCookie = await signIn(app, parent);
    const instanceId = await postBonus(app, parentCookie, { expiresInMinutes: 120 });
    const cookie = await signIn(app, child);
    await app.inject({ method: 'POST', url: `/api/bonus/${instanceId}/claim`, headers: { cookie, ...json } });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/parent/bonus/${instanceId}`,
      headers: { cookie: parentCookie, ...json },
    });
    // Pulling it now means a child sweeping the garage for points that vanished.
    expect(response.statusCode).toBe(409);
    expect((await stateOf(instanceId))?.assigned_to).toBe(child);
    await app.close();
  });

  it('removes one nobody has claimed', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Tidy Parent');
    const parentCookie = await signIn(app, parent);
    const instanceId = await postBonus(app, parentCookie);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/parent/bonus/${instanceId}`,
      headers: { cookie: parentCookie, ...json },
    });
    expect(response.statusCode).toBe(200);
    expect(await stateOf(instanceId)).toBeUndefined();
    await app.close();
  });
});
