/**
 * Push notifications.
 *
 * The drain is a reconciliation like the sweep it follows, so the properties
 * worth proving are about what it refuses to send as much as what it sends: not
 * the kinds that would train a household to ignore the phone, not something
 * already read on another device, and not a pile of yesterday's reminders after
 * the laptop has been off. Plus the one that matters when a phone goes missing -
 * signing a device out has to stop it buzzing.
 *
 * web-push itself is stubbed. There is no push service to talk to in CI, and
 * the behavior under test is which rows get sent and what happens to a
 * subscription the service has given up on - not whether the encryption works.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import '../pg-parsers.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { hashPin } from '../auth/pin.js';
import { SESSION_COOKIE } from '../auth/plugin.js';

const sendNotification = vi.fn();

vi.mock('web-push', () => {
  class WebPushError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
    ) {
      super(message);
    }
  }
  return {
    default: {
      setVapidDetails: vi.fn(),
      sendNotification: (...args: unknown[]) => sendNotification(...args),
      generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
    },
    WebPushError,
  };
});

const { drainPushQueue } = await import('../notifications/push.js');
const webpush = await import('web-push');

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

const TZ = 'America/Chicago';

const base = {
  NODE_ENV: 'test',
  PORT: '4011',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: TZ,
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: connectionString,
  SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
} as NodeJS.ProcessEnv;

/** The household that has never run `npm run vapid`. */
const envWithoutKeys = loadEnv(base);

/** The household that has. */
const envWithKeys = loadEnv({
  ...base,
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:parent@example.com',
} as NodeJS.ProcessEnv);

const log = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Parameters<typeof drainPushQueue>[2];

let pool: pg.Pool;
const createdUsers: string[] = [];

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

async function putInInbox(
  userId: string,
  kind: string,
  options: { read?: boolean; ageMinutes?: number } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO notifications (user_id, kind, title, body, created_at, read_at)
     VALUES ($1, $2, $3, '', now() - make_interval(mins => $4::int), $5)
     RETURNING id`,
    [userId, kind, `${kind} for test`, options.ageMinutes ?? 0, options.read ? new Date() : null],
  );
  return rows[0]?.id as string;
}

async function subscribe(userId: string, endpoint: string, sessionId?: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO push_subscriptions (user_id, session_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, 'key', 'secret') RETURNING id`,
    [userId, sessionId ?? null, endpoint],
  );
  return rows[0]?.id as string;
}

async function pushedAt(notificationId: string): Promise<Date | null> {
  const { rows } = await pool.query<{ pushed_at: Date | null }>(
    'SELECT pushed_at FROM notifications WHERE id = $1',
    [notificationId],
  );
  return rows[0]?.pushed_at ?? null;
}

async function subscriptionCount(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM push_subscriptions WHERE user_id = $1',
    [userId],
  );
  return rows[0]?.count ?? 0;
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

/**
 * A rejection shaped like the one a push service produces.
 *
 * Built through the mocked class rather than the real one so `instanceof` in
 * the drain still matches, and constructed through a cast because the real
 * WebPushError takes five arguments the stub has no use for - the drain reads
 * exactly one of them.
 */
function pushServiceError(message: string, statusCode: number): Error {
  const Ctor = webpush.WebPushError as unknown as new (message: string, code: number) => Error;
  return new Ctor(message, statusCode);
}

const SUBSCRIPTION = {
  endpoint: 'https://push.example.com/subscription/abc123',
  keys: { p256dh: 'a-browser-public-key', auth: 'a-browser-secret' },
};

beforeAll(() => {
  if (connectionString) pool = new pg.Pool({ connectionString, max: 4 });
});

afterEach(async () => {
  sendNotification.mockReset();
  if (createdUsers.length > 0) {
    // push_subscriptions and notifications both cascade from users.
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUsers]);
    createdUsers.length = 0;
  }
});

afterAll(async () => {
  await pool?.end();
});

describeDb('what reaches a phone', () => {
  it('sends the evening reminder, and nothing else in the inbox', async () => {
    const child = await makeUser('child', 'Pushed Child');
    await subscribe(child, SUBSCRIPTION.endpoint);

    const reminder = await putInInbox(child, 'chore_reminder');
    const approved = await putInInbox(child, 'chore_approved');
    const bonus = await putInInbox(child, 'bonus_posted');

    sendNotification.mockResolvedValue({ statusCode: 201 });
    const result = await drainPushQueue(pool, envWithKeys, log);

    expect(result.sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);

    // Every row is closed out, so none of them is reconsidered next tick - but
    // only one of them rang.
    expect(await pushedAt(reminder)).not.toBeNull();
    expect(await pushedAt(approved)).not.toBeNull();
    expect(await pushedAt(bonus)).not.toBeNull();

    const [, payload] = sendNotification.mock.calls[0] as [unknown, string];
    expect(JSON.parse(payload)).toMatchObject({ id: reminder, title: 'chore_reminder for test' });
  });

  it('does not push an escalation, because a parent has the dashboard', async () => {
    const parent = await makeUser('parent', 'Quiet Parent');
    await subscribe(parent, 'https://push.example.com/subscription/parent');
    await putInInbox(parent, 'chore_escalation');

    const result = await drainPushQueue(pool, envWithKeys, log);

    expect(result.sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('stays quiet about a reminder already read on another device', async () => {
    const child = await makeUser('child', 'Read Child');
    await subscribe(child, 'https://push.example.com/subscription/read');
    await putInInbox(child, 'chore_reminder', { read: true });

    const result = await drainPushQueue(pool, envWithKeys, log);

    expect(result.sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('does not buzz about yesterday after the laptop has been off', async () => {
    const child = await makeUser('child', 'Stale Child');
    await subscribe(child, 'https://push.example.com/subscription/stale');
    const old = await putInInbox(child, 'chore_reminder', { ageMinutes: 60 * 20 });

    const result = await drainPushQueue(pool, envWithKeys, log);

    expect(result.sent).toBe(0);
    // Closed rather than left pending, so it never rings on a later tick.
    expect(await pushedAt(old)).not.toBeNull();
  });

  it('never sends the same reminder twice, however often it drains', async () => {
    const child = await makeUser('child', 'Once Child');
    await subscribe(child, 'https://push.example.com/subscription/once');
    await putInInbox(child, 'chore_reminder');

    sendNotification.mockResolvedValue({ statusCode: 201 });
    await drainPushQueue(pool, envWithKeys, log);
    await drainPushQueue(pool, envWithKeys, log);
    await drainPushQueue(pool, envWithKeys, log);

    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('holds a reminder until the household has keys, rather than losing it', async () => {
    const child = await makeUser('child', 'Keyless Child');
    await subscribe(child, 'https://push.example.com/subscription/keyless');
    const reminder = await putInInbox(child, 'chore_reminder');

    await drainPushQueue(pool, envWithoutKeys, log);
    expect(sendNotification).not.toHaveBeenCalled();
    // Still pending: adding the keys this evening still delivers tonight.
    expect(await pushedAt(reminder)).toBeNull();

    sendNotification.mockResolvedValue({ statusCode: 201 });
    const result = await drainPushQueue(pool, envWithKeys, log);
    expect(result.sent).toBe(1);
  });

  it('goes quiet for a child a parent has muted, but still fills the inbox', async () => {
    const child = await makeUser('child', 'Muted Child');
    await subscribe(child, 'https://push.example.com/subscription/muted');
    await pool.query('UPDATE users SET reminders_muted = true WHERE id = $1', [child]);
    const reminder = await putInInbox(child, 'chore_reminder');

    const result = await drainPushQueue(pool, envWithKeys, log);

    expect(result.sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
    // Closed rather than held: muting stops the phone, not the record, and the
    // reminder is sitting in the inbox waiting to be read.
    expect(await pushedAt(reminder)).not.toBeNull();
  });

  it('sends again the moment a parent unmutes', async () => {
    const child = await makeUser('child', 'Unmuted Child');
    await subscribe(child, 'https://push.example.com/subscription/unmuted');
    await pool.query('UPDATE users SET reminders_muted = true WHERE id = $1', [child]);
    await putInInbox(child, 'chore_reminder');

    await drainPushQueue(pool, envWithKeys, log);
    expect(sendNotification).not.toHaveBeenCalled();

    // The old reminder stays closed - unmuting is not a licence to replay
    // yesterday - so a fresh one is what proves the switch works.
    await pool.query('UPDATE users SET reminders_muted = false WHERE id = $1', [child]);
    await putInInbox(child, 'chore_escalation');
    await pool.query(
      `UPDATE notifications SET kind = 'chore_reminder', chore_instance_id = NULL
        WHERE user_id = $1 AND kind = 'chore_escalation'`,
      [child],
    );

    sendNotification.mockResolvedValue({ statusCode: 201 });
    const result = await drainPushQueue(pool, envWithKeys, log);
    expect(result.sent).toBe(1);
  });

  it('forgets a subscription the push service says is gone', async () => {
    const child = await makeUser('child', 'Gone Child');
    await subscribe(child, 'https://push.example.com/subscription/gone');
    await putInInbox(child, 'chore_reminder');

    sendNotification.mockRejectedValue(pushServiceError('gone', 410));
    const result = await drainPushQueue(pool, envWithKeys, log);

    expect(result.pruned).toBe(1);
    expect(await subscriptionCount(child)).toBe(0);
  });

  it('keeps a subscription through a push service having a bad minute', async () => {
    const child = await makeUser('child', 'Unlucky Child');
    await subscribe(child, 'https://push.example.com/subscription/flaky');
    await putInInbox(child, 'chore_reminder');

    sendNotification.mockRejectedValue(pushServiceError('service unavailable', 503));
    const result = await drainPushQueue(pool, envWithKeys, log);

    expect(result.pruned).toBe(0);
    expect(await subscriptionCount(child)).toBe(1);
  });
});

describeDb('subscribing a phone', () => {
  let app: App;

  beforeAll(async () => {
    if (connectionString) app = await buildApp({ env: envWithKeys });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('hands out the public key only to somebody signed in', async () => {
    const child = await makeUser('child', 'Key Child');
    const anonymous = await app.inject({ method: 'GET', url: '/api/push/key' });
    expect(anonymous.statusCode).toBe(401);

    const cookie = await signIn(app, child);
    const response = await app.inject({ method: 'GET', url: '/api/push/key', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ configured: true, publicKey: 'test-public-key' });
  });

  it('moves a shared tablet to whoever signs in on it, rather than keeping both', async () => {
    const first = await makeUser('child', 'First Child');
    const second = await makeUser('child', 'Second Child');

    const firstCookie = await signIn(app, first);
    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: { cookie: firstCookie },
      payload: SUBSCRIPTION,
    });
    expect(await subscriptionCount(first)).toBe(1);

    const secondCookie = await signIn(app, second);
    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: { cookie: secondCookie },
      payload: SUBSCRIPTION,
    });

    // One tablet, one subscription, and the reminders follow whoever holds it.
    expect(await subscriptionCount(first)).toBe(0);
    expect(await subscriptionCount(second)).toBe(1);
  });

  it('refuses to unsubscribe somebody else with a guessed endpoint', async () => {
    const owner = await makeUser('child', 'Owner Child');
    const other = await makeUser('child', 'Other Child');
    await subscribe(owner, SUBSCRIPTION.endpoint);

    const cookie = await signIn(app, other);
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/push/subscribe',
      headers: { cookie },
      payload: { endpoint: SUBSCRIPTION.endpoint },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().removed).toBe(0);
    expect(await subscriptionCount(owner)).toBe(1);
  });

  it('stops buzzing a phone that has signed out', async () => {
    const child = await makeUser('child', 'Leaving Child');
    const cookie = await signIn(app, child);

    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: { cookie },
      payload: SUBSCRIPTION,
    });
    expect(await subscriptionCount(child)).toBe(1);

    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(await subscriptionCount(child)).toBe(0);
  });

  it('stops buzzing every phone when a parent resets the PIN', async () => {
    const parent = await makeUser('parent', 'Resetting Parent');
    const child = await makeUser('child', 'Lost Phone Child');

    const childCookie = await signIn(app, child);
    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: { cookie: childCookie },
      payload: SUBSCRIPTION,
    });
    expect(await subscriptionCount(child)).toBe(1);

    // The reason this matters: a PIN is reset because a phone went missing.
    const parentCookie = await signIn(app, parent);
    const reset = await app.inject({
      method: 'PUT',
      url: `/api/parent/members/${child}/pin`,
      headers: { cookie: parentCookie },
      payload: { pin: '9182' },
    });
    expect(reset.statusCode).toBe(200);
    expect(await subscriptionCount(child)).toBe(0);
  });

  it('tells a parent whose reminders are not reaching, and only a parent', async () => {
    const parent = await makeUser('parent', 'Checking Parent');
    const reachable = await makeUser('child', 'Reachable Child');
    const silent = await makeUser('child', 'Silent Child');
    await subscribe(reachable, 'https://push.example.com/subscription/reachable');

    const childCookie = await signIn(app, silent);
    const refused = await app.inject({
      method: 'GET',
      url: '/api/parent/push/children',
      headers: { cookie: childCookie },
    });
    expect(refused.statusCode).toBe(403);

    const parentCookie = await signIn(app, parent);
    const response = await app.inject({
      method: 'GET',
      url: '/api/parent/push/children',
      headers: { cookie: parentCookie },
    });
    expect(response.statusCode).toBe(200);

    const listed = response.json().children as {
      id: string;
      remindersReaching: boolean;
      devices: number;
    }[];
    expect(listed.find((c) => c.id === reachable)?.remindersReaching).toBe(true);
    // The whole point of the screen: a child with no phone signed up is
    // visible rather than quietly missing their reminders.
    expect(listed.find((c) => c.id === silent)?.remindersReaching).toBe(false);
    expect(listed.find((c) => c.id === silent)?.devices).toBe(0);
  });

  it('lets a parent mute a child, and nobody else', async () => {
    const parent = await makeUser('parent', 'Muting Parent');
    const child = await makeUser('child', 'Mutable Child');
    await subscribe(child, 'https://push.example.com/subscription/mutable');

    // A child cannot reach their own switch. That is the entire arrangement.
    const childCookie = await signIn(app, child);
    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/parent/push/children/${child}`,
      headers: { cookie: childCookie },
      payload: { muted: true },
    });
    expect(refused.statusCode).toBe(403);

    const parentCookie = await signIn(app, parent);
    const muted = await app.inject({
      method: 'PATCH',
      url: `/api/parent/push/children/${child}`,
      headers: { cookie: parentCookie },
      payload: { muted: true },
    });
    expect(muted.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/api/parent/push/children',
      headers: { cookie: parentCookie },
    });
    const row = (after.json().children as { id: string; mutedByParent: boolean; remindersReaching: boolean }[])
      .find((c) => c.id === child);
    expect(row?.mutedByParent).toBe(true);
    // Muted beats a subscribed phone: saying "on" would be a lie.
    expect(row?.remindersReaching).toBe(false);
  });

  it('refuses to mute a parent', async () => {
    const parent = await makeUser('parent', 'Immune Parent');
    const other = await makeUser('parent', 'Other Parent');
    const cookie = await signIn(app, parent);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/parent/push/children/${other}`,
      headers: { cookie },
      payload: { muted: true },
    });
    expect(response.statusCode).toBe(404);
  });

  it('counts phones for the system screen, and only for a parent', async () => {
    const parent = await makeUser('parent', 'Watching Parent');
    const child = await makeUser('child', 'Counted Child');
    await subscribe(child, SUBSCRIPTION.endpoint);

    const childCookie = await signIn(app, child);
    const refused = await app.inject({
      method: 'GET',
      url: '/api/push/status',
      headers: { cookie: childCookie },
    });
    expect(refused.statusCode).toBe(403);

    const parentCookie = await signIn(app, parent);
    const response = await app.inject({
      method: 'GET',
      url: '/api/push/status',
      headers: { cookie: parentCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().configured).toBe(true);
    expect(response.json().devices).toBeGreaterThanOrEqual(1);
  });
});

describe('the environment', () => {
  it('refuses two VAPID values out of three', () => {
    expect(() =>
      loadEnv({ ...base, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' } as NodeJS.ProcessEnv),
    ).toThrow(/together/);
  });

  it('treats blank VAPID values as absent, so push is simply off', () => {
    const env = loadEnv({
      ...base,
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
      VAPID_SUBJECT: '',
    } as NodeJS.ProcessEnv);
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
  });

  it('refuses a VAPID subject the push services would reject', () => {
    expect(() =>
      loadEnv({
        ...base,
        VAPID_PUBLIC_KEY: 'pub',
        VAPID_PRIVATE_KEY: 'priv',
        VAPID_SUBJECT: 'parent@example.com',
      } as NodeJS.ProcessEnv),
    ).toThrow(/mailto:/);
  });
});
