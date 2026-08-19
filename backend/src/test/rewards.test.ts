/**
 * Rewards, redemption, and the wallet.
 *
 * Spending is the other direction of a child's money. Overdrawing, double
 * spending, and a denial that fails to give the points back all get explicit
 * tests, because each of them is invisible until a child notices and by then
 * the trust is gone.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import '../pg-parsers.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { hashPin } from '../auth/pin.js';
import { SESSION_COOKIE } from '../auth/plugin.js';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '4006',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: 'America/Chicago',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: connectionString,
  SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
} as NodeJS.ProcessEnv);

let pool: pg.Pool;
const createdUsers: string[] = [];
const createdRewards: string[] = [];

type App = Awaited<ReturnType<typeof buildApp>>;

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

/** Gives a child points the only way the system ever does: a ledger row. */
async function grantPoints(childId: string, amount: number): Promise<void> {
  await pool.query(
    `INSERT INTO points_ledger (child_id, delta, reason, label)
     VALUES ($1, $2, 'manual_adjustment', 'Test grant')`,
    [childId, amount],
  );
}

async function makeReward(name: string, cost: number, extra: { lockedUntil?: string } = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO rewards (name, description, cost_points, category, icon, locked_until)
     VALUES ($1, '', $2, 'Screen Time', 'screen', $3) RETURNING id`,
    [name, cost, extra.lockedUntil ?? null],
  );
  const id = rows[0]?.id as string;
  createdRewards.push(id);
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

async function balanceOf(childId: string): Promise<number> {
  const { rows } = await pool.query<{ balance: number }>(
    'SELECT coalesce(sum(delta), 0)::int AS balance FROM points_ledger WHERE child_id = $1',
    [childId],
  );
  return rows[0]?.balance ?? 0;
}

const json = { 'content-type': 'application/json' };

beforeAll(() => {
  if (connectionString) pool = new pg.Pool({ connectionString, max: 4 });
});

afterEach(async () => {
  if (createdUsers.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUsers]);
    createdUsers.length = 0;
  }
  if (createdRewards.length > 0) {
    await pool.query('DELETE FROM reward_redemptions WHERE reward_id = ANY($1::uuid[])', [createdRewards]);
    await pool.query('DELETE FROM rewards WHERE id = ANY($1::uuid[])', [createdRewards]);
    createdRewards.length = 0;
  }
});

afterAll(async () => {
  await pool?.end();
});

describeDb('redeeming', () => {
  it('holds the points immediately, as its own ledger line', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Redeem Child');
    const reward = await makeReward('Movie night', 150);
    await grantPoints(child, 200);
    const cookie = await signIn(app, child);

    const response = await app.inject({
      method: 'POST',
      url: `/api/rewards/${reward}/redeem`,
      headers: { cookie, ...json },
    });

    expect(response.statusCode).toBe(200);
    // "Your points are held" on the screen has to be true the moment they tap.
    expect(await balanceOf(child)).toBe(50);

    const { rows } = await pool.query<{ delta: number; reason: string }>(
      'SELECT delta, reason FROM points_ledger WHERE child_id = $1 ORDER BY created_at',
      [child],
    );
    expect(rows[1]).toMatchObject({ delta: -150, reason: 'reward_redeemed' });
    await app.close();
  });

  it('refuses when the points are not there', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Broke Child');
    const reward = await makeReward('Movie night', 150);
    await grantPoints(child, 100);
    const cookie = await signIn(app, child);

    const response = await app.inject({
      method: 'POST',
      url: `/api/rewards/${reward}/redeem`,
      headers: { cookie, ...json },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/not enough points/i);
    expect(await balanceOf(child)).toBe(100);
    await app.close();
  });

  it('cannot be spent twice by tapping twice', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Double Spend Child');
    const first = await makeReward('Movie night', 150);
    const second = await makeReward('Dinner pick', 150);
    await grantPoints(child, 150);
    const cookie = await signIn(app, child);

    // Two different rewards, one balance that only covers one of them.
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/rewards/${first}/redeem`, headers: { cookie, ...json } }),
      app.inject({ method: 'POST', url: `/api/rewards/${second}/redeem`, headers: { cookie, ...json } }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 400]);
    // Never overdrawn, whichever won.
    expect(await balanceOf(child)).toBe(0);
    await app.close();
  });

  it('will not redeem a reward that is locked or retired', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Locked Child');
    const locked = await makeReward('Later bedtime', 90, { lockedUntil: '2099-01-01' });
    const retired = await makeReward('Old reward', 90);
    await pool.query('UPDATE rewards SET is_active = false WHERE id = $1', [retired]);
    await grantPoints(child, 500);
    const cookie = await signIn(app, child);

    const lockedResponse = await app.inject({
      method: 'POST',
      url: `/api/rewards/${locked}/redeem`,
      headers: { cookie, ...json },
    });
    expect(lockedResponse.statusCode).toBe(409);

    const retiredResponse = await app.inject({
      method: 'POST',
      url: `/api/rewards/${retired}/redeem`,
      headers: { cookie, ...json },
    });
    expect(retiredResponse.statusCode).toBe(404);

    expect(await balanceOf(child)).toBe(500);
    await app.close();
  });
});

describeDb('deciding a request', () => {
  async function requestOne(app: App, cookie: string, rewardId: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/rewards/${rewardId}/redeem`,
      headers: { cookie, ...json },
    });
    return response.json().redemption.id;
  }

  it('approving keeps the points spent', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Approved Reward Child');
    const parent = await makeUser('parent', 'Approving Parent');
    const reward = await makeReward('Movie night', 150);
    await grantPoints(child, 200);

    const childCookie = await signIn(app, child);
    const redemptionId = await requestOne(app, childCookie, reward);
    const parentCookie = await signIn(app, parent);

    const response = await app.inject({
      method: 'POST',
      url: `/api/parent/redemptions/${redemptionId}/approve`,
      headers: { cookie: parentCookie, ...json },
    });

    expect(response.statusCode).toBe(200);
    expect(await balanceOf(child)).toBe(50);
    await app.close();
  });

  it('denying gives back exactly what was taken', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Denied Child');
    const parent = await makeUser('parent', 'Denying Parent');
    const reward = await makeReward('Movie night', 150);
    await grantPoints(child, 200);

    const childCookie = await signIn(app, child);
    const redemptionId = await requestOne(app, childCookie, reward);
    expect(await balanceOf(child)).toBe(50);

    const parentCookie = await signIn(app, parent);
    await app.inject({
      method: 'POST',
      url: `/api/parent/redemptions/${redemptionId}/deny`,
      payload: { note: 'Not on a school night.' },
      headers: { cookie: parentCookie, ...json },
    });

    expect(await balanceOf(child)).toBe(200);

    const { rows } = await pool.query<{ delta: number; reason: string }>(
      'SELECT delta, reason FROM points_ledger WHERE child_id = $1 ORDER BY created_at',
      [child],
    );
    // A charge and a refund, not points that quietly reappeared.
    expect(rows.map((r) => r.reason)).toEqual([
      'manual_adjustment',
      'reward_redeemed',
      'reward_refunded',
    ]);
    await app.close();
  });

  it('cannot be decided twice, and cannot refund twice', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Twice Child');
    const parent = await makeUser('parent', 'Twice Parent');
    const reward = await makeReward('Movie night', 150);
    await grantPoints(child, 200);

    const childCookie = await signIn(app, child);
    const redemptionId = await requestOne(app, childCookie, reward);
    const parentCookie = await signIn(app, parent);

    const deny = () =>
      app.inject({
        method: 'POST',
        url: `/api/parent/redemptions/${redemptionId}/deny`,
        headers: { cookie: parentCookie, ...json },
      });

    expect((await deny()).statusCode).toBe(200);
    expect((await deny()).statusCode).toBe(409);
    // Refunded once, not twice.
    expect(await balanceOf(child)).toBe(200);
    await app.close();
  });

  it('is closed to children', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Self Deciding Child');
    const reward = await makeReward('Movie night', 150);
    await grantPoints(child, 200);
    const cookie = await signIn(app, child);
    const redemptionId = await requestOne(app, cookie, reward);

    const response = await app.inject({
      method: 'POST',
      url: `/api/parent/redemptions/${redemptionId}/approve`,
      headers: { cookie, ...json },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describeDb('managing the catalogue', () => {
  it('creates, edits, and retires without losing history', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Catalogue Parent');
    const child = await makeUser('child', 'Catalogue Child');
    const parentCookie = await signIn(app, parent);

    const created = await app.inject({
      method: 'POST',
      url: '/api/parent/rewards',
      payload: {
        name: 'Extra screen time',
        description: 'One hour, any device.',
        costPoints: 120,
        category: 'Screen Time',
        icon: 'screen',
      },
      headers: { cookie: parentCookie, ...json },
    });
    expect(created.statusCode).toBe(200);
    const rewardId = created.json().reward.id as string;
    createdRewards.push(rewardId);

    // A child redeems it, so there is history to preserve.
    await grantPoints(child, 200);
    const childCookie = await signIn(app, child);
    await app.inject({
      method: 'POST',
      url: `/api/rewards/${rewardId}/redeem`,
      headers: { cookie: childCookie, ...json },
    });

    await app.inject({
      method: 'PATCH',
      url: `/api/parent/rewards/${rewardId}`,
      payload: { costPoints: 140 },
      headers: { cookie: parentCookie, ...json },
    });

    const retired = await app.inject({
      method: 'DELETE',
      url: `/api/parent/rewards/${rewardId}`,
      headers: { cookie: parentCookie, ...json },
    });
    expect(retired.statusCode).toBe(200);

    // Retired, not deleted: the child's history still names what they saved for,
    // and the redemption keeps the price they actually paid.
    const { rows } = await pool.query<{ is_active: boolean }>(
      'SELECT is_active FROM rewards WHERE id = $1',
      [rewardId],
    );
    expect(rows[0]?.is_active).toBe(false);

    const { rows: redemption } = await pool.query<{ cost_points: number }>(
      'SELECT cost_points FROM reward_redemptions WHERE reward_id = $1',
      [rewardId],
    );
    expect(redemption[0]?.cost_points).toBe(120);
    await app.close();
  });

  it('rejects a reward with no name or a nonsense price', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Validating Parent');
    const cookie = await signIn(app, parent);

    for (const payload of [
      { name: '', costPoints: 100, category: 'Food', icon: 'food' },
      { name: 'Free thing', costPoints: 0, category: 'Food', icon: 'food' },
      { name: 'Negative', costPoints: -50, category: 'Food', icon: 'food' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/parent/rewards',
        payload,
        headers: { cookie, ...json },
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });

  it('is closed to children', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Shopping Child');
    const cookie = await signIn(app, child);

    const response = await app.inject({
      method: 'POST',
      url: '/api/parent/rewards',
      payload: { name: 'Unlimited sweets', costPoints: 1, category: 'Food', icon: 'food' },
      headers: { cookie, ...json },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describeDb('saving goals', () => {
  it('keeps only one goal at a time', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Goal Child');
    const first = await makeReward('Movie night', 150);
    const second = await makeReward('Friend over', 300);
    const cookie = await signIn(app, child);

    for (const rewardId of [first, second]) {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/child/rewards/${rewardId}/preferences`,
        payload: { isPrimaryGoal: true },
        headers: { cookie, ...json },
      });
      expect(response.statusCode).toBe(200);
    }

    // The home screen shows exactly one goal, so setting a second stands the
    // first down rather than failing on the unique index.
    const { rows } = await pool.query<{ reward_id: string }>(
      'SELECT reward_id FROM child_reward_preferences WHERE child_id = $1 AND is_primary_goal',
      [child],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reward_id).toBe(second);
    await app.close();
  });
});

describeDb('the wallet', () => {
  it('reports the balance and every line behind it', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Wallet Child');
    const reward = await makeReward('Movie night', 150);
    await grantPoints(child, 200);
    const cookie = await signIn(app, child);
    await app.inject({
      method: 'POST',
      url: `/api/rewards/${reward}/redeem`,
      headers: { cookie, ...json },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/child/wallet',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const wallet = response.json();
    expect(wallet.spendablePoints).toBe(50);
    expect(wallet.lifetimePoints).toBe(200);
    expect(wallet.spentPoints).toBe(150);
    expect(wallet.history).toHaveLength(2);
    // Newest first, which is the order the screen reads them in.
    expect(wallet.history[0].delta).toBe(-150);
    await app.close();
  });

  it('reports cash-out as unconfigured while the owner values are unset', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Cash Out Child');
    const cookie = await signIn(app, child);

    const response = await app.inject({
      method: 'GET',
      url: '/api/child/wallet',
      headers: { cookie },
    });

    const cashOut = response.json().cashOut;
    // The specification forbids inventing either value, so the screen must be
    // told plainly that cash-out is off rather than shown a made-up rate.
    expect(cashOut.configured).toBe(false);
    expect(cashOut.pointsPerDollar).toBeNull();
    expect(cashOut.minimumPoints).toBeNull();
    expect(cashOut.availableCents).toBeNull();
    // The $40 weekly cap is fixed by the specification and is set.
    expect(cashOut.weeklyCapCents).toBe(4000);
    await app.close();
  });

  it('is one child\'s own, and closed to a parent', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Wallet Parent');
    const cookie = await signIn(app, parent);

    expect((await app.inject({ method: 'GET', url: '/api/child/wallet' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/api/child/wallet', headers: { cookie } })).statusCode,
    ).toBe(403);
    await app.close();
  });
});
