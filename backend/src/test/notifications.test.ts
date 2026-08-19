/**
 * Reminders, escalations, and the inbox.
 *
 * The sweep is written as a reconciliation rather than an event, so the
 * properties worth proving are that it never sends twice, that it still delivers
 * after a restart that missed the moment, and that it goes quiet the instant the
 * chore is done.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import '../pg-parsers.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { hashPin } from '../auth/pin.js';
import { SESSION_COOKIE } from '../auth/plugin.js';
import { sweepReminders } from '../notifications/service.js';
import { householdToday } from '../time.js';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

const TZ = 'America/Chicago';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '4010',
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

/** 8:45pm and 11:10pm in Chicago on a fixed day, as real instants. */
const AFTER_REMINDER = new Date('2026-08-20T01:50:00Z');
const AFTER_ESCALATION = new Date('2026-08-20T04:10:00Z');
const BEFORE_REMINDER = new Date('2026-08-19T22:00:00Z');

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

/** Places a chore on the household day the fixed instants above fall in. */
async function placeChore(childId: string, status = 'not_started'): Promise<string> {
  const { rows: def } = await pool.query<{ id: string }>(
    `INSERT INTO chore_definitions (name, icon, kind, points)
     VALUES ('Kitchen Cleaning', 'kitchen', 'core', 10) RETURNING id`,
  );
  const choreId = def[0]?.id as string;
  createdChores.push(choreId);

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chore_instances (chore_definition_id, assigned_to, chore_date, points_value, status)
     VALUES ($1, $2, $3::date, 10, $4::chore_status) RETURNING id`,
    [choreId, childId, householdToday(TZ, AFTER_REMINDER), status],
  );
  return rows[0]?.id as string;
}

/**
 * One person's notifications.
 *
 * The sweep is household-wide by design - every parent hears about every child -
 * and test files share one database, so another file's outstanding chore can put
 * an escalation in these parents' inboxes too. Assertions below therefore look
 * for the notification they expect rather than assuming it is the only one, or
 * the first.
 */
async function inboxOf(userId: string) {
  const { rows } = await pool.query<{ kind: string; title: string; body: string }>(
    'SELECT kind, title, body FROM notifications WHERE user_id = $1 ORDER BY created_at',
    [userId],
  );
  return rows;
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

describeDb('the reminder sweep', () => {
  it('says nothing before the reminder time', async () => {
    const child = await makeUser('child', 'Early Child');
    await placeChore(child);

    const result = await sweepReminders(pool, TZ, BEFORE_REMINDER);
    expect(result.reminders).toBe(0);
    expect(await inboxOf(child)).toHaveLength(0);
  });

  it('nudges the child, and only the child, at the reminder time', async () => {
    const child = await makeUser('child', 'Nudged Child');
    const parent = await makeUser('parent', 'Quiet Parent');
    await placeChore(child);

    const result = await sweepReminders(pool, TZ, AFTER_REMINDER);
    expect(result.escalations).toBe(0);

    const inbox = await inboxOf(child);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.kind).toBe('chore_reminder');
    expect(inbox[0]?.body).toMatch(/on-time bonus/i);
    // A parent told at 8:45pm about something the child still has two hours to
    // sort out is how everyone learns to ignore notifications.
    expect(await inboxOf(parent)).toHaveLength(0);
  });

  it('never sends the same reminder twice, however often it runs', async () => {
    const child = await makeUser('child', 'Repeated Child');
    await placeChore(child);

    await sweepReminders(pool, TZ, AFTER_REMINDER);
    const second = await sweepReminders(pool, TZ, AFTER_REMINDER);
    const third = await sweepReminders(pool, TZ, AFTER_ESCALATION);

    expect(second.reminders).toBe(0);
    expect(third.reminders).toBe(0);
    expect((await inboxOf(child)).filter((n) => n.kind === 'chore_reminder')).toHaveLength(1);
  });

  it('still delivers after a restart that missed the moment', async () => {
    const child = await makeUser('child', 'Restarted Child');
    await placeChore(child);

    // Nothing ran at 8:45pm; the first sweep of the evening happens at 11:10pm.
    await sweepReminders(pool, TZ, AFTER_ESCALATION);

    // The sweep asks what should have been sent by now, not what just happened,
    // so a Windows update at 8:44pm cannot swallow the evening.
    expect((await inboxOf(child)).map((n) => n.kind)).toContain('chore_reminder');
  });

  it('tells the parents at the escalation time', async () => {
    const child = await makeUser('child', 'Escalated Child');
    const mum = await makeUser('parent', 'Escalation Parent One');
    const dad = await makeUser('parent', 'Escalation Parent Two');
    await placeChore(child);

    await sweepReminders(pool, TZ, AFTER_ESCALATION);

    for (const parent of [mum, dad]) {
      const escalations = (await inboxOf(parent)).filter((n) => n.kind === 'chore_escalation');
      expect(escalations.some((n) => n.body.includes('Escalated Child'))).toBe(true);
    }

    // The child hears once, at the reminder. Nagging twice is just nagging.
    expect((await inboxOf(child)).filter((n) => n.kind === 'chore_escalation')).toHaveLength(0);
  });

  it('goes quiet once the chore is sent in', async () => {
    const child = await makeUser('child', 'Finished Child');
    await placeChore(child, 'submitted');

    const result = await sweepReminders(pool, TZ, AFTER_ESCALATION);
    expect(result.reminders).toBe(0);
    expect(await inboxOf(child)).toHaveLength(0);
  });

  it('says nothing about a deactivated child', async () => {
    const child = await makeUser('child', 'Inactive Child');
    await placeChore(child);
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [child]);

    const result = await sweepReminders(pool, TZ, AFTER_ESCALATION);
    expect(result.reminders).toBe(0);
  });
});

describeDb('notifications from things that happen', () => {
  it('tells a child their chore was approved, and what it paid', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Told Child');
    const parent = await makeUser('parent', 'Telling Parent');

    const { rows: def } = await pool.query<{ id: string }>(
      `INSERT INTO chore_definitions (name, icon, kind, points)
       VALUES ('Bathroom', 'bathroom', 'core', 10) RETURNING id`,
    );
    createdChores.push(def[0]?.id as string);
    const { rows: inst } = await pool.query<{ id: string }>(
      `INSERT INTO chore_instances (chore_definition_id, assigned_to, chore_date, points_value, status, submitted_punctual)
       VALUES ($1, $2, CURRENT_DATE, 10, 'submitted', true) RETURNING id`,
      [def[0]?.id, child],
    );
    const instanceId = inst[0]?.id as string;

    const cookie = await signIn(app, parent);
    await app.inject({
      method: 'POST',
      url: `/api/parent/approvals/${instanceId}/approve`,
      headers: { cookie, ...json },
    });

    const inbox = await inboxOf(child);
    expect(inbox[0]?.kind).toBe('chore_approved');
    expect(inbox[0]?.body).toMatch(/on time/i);
    await app.close();
  });

  it('passes the parent\'s note through when a chore is sent back', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Sent Back Child');
    const parent = await makeUser('parent', 'Sending Parent');

    const { rows: def } = await pool.query<{ id: string }>(
      `INSERT INTO chore_definitions (name, icon, kind, points)
       VALUES ('Bathroom', 'bathroom', 'core', 10) RETURNING id`,
    );
    createdChores.push(def[0]?.id as string);
    const { rows: inst } = await pool.query<{ id: string }>(
      `INSERT INTO chore_instances (chore_definition_id, assigned_to, chore_date, points_value, status)
       VALUES ($1, $2, CURRENT_DATE, 10, 'submitted') RETURNING id`,
      [def[0]?.id, child],
    );

    const cookie = await signIn(app, parent);
    await app.inject({
      method: 'POST',
      url: `/api/parent/approvals/${inst[0]?.id}/reject`,
      payload: { note: 'The mirror still has spots.' },
      headers: { cookie, ...json },
    });

    const inbox = await inboxOf(child);
    expect(inbox[0]?.kind).toBe('chore_rejected');
    // The reason is the whole point; a bare "needs fixing" helps nobody.
    expect(inbox[0]?.body).toMatch(/mirror/i);
    await app.close();
  });
});

describeDb('the inbox', () => {
  it('shows only your own, and marks them read', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Inbox Child');
    const other = await makeUser('child', 'Other Inbox Child');
    await placeChore(child);
    await sweepReminders(pool, TZ, AFTER_REMINDER);

    const cookie = await signIn(app, child);
    const listed = await app.inject({ method: 'GET', url: '/api/notifications', headers: { cookie } });
    expect(listed.json().unread).toBe(1);
    const id = listed.json().notifications[0].id as string;

    // Somebody else's inbox is not reachable by guessing.
    const otherCookie = await signIn(app, other);
    expect(
      (await app.inject({
        method: 'POST',
        url: `/api/notifications/${id}/read`,
        headers: { cookie: otherCookie, ...json },
      })).statusCode,
    ).toBe(404);

    await app.inject({
      method: 'POST',
      url: `/api/notifications/${id}/read`,
      headers: { cookie, ...json },
    });
    const after = await app.inject({ method: 'GET', url: '/api/notifications', headers: { cookie } });
    expect(after.json().unread).toBe(0);
    await app.close();
  });

  it('is closed to anyone signed out', async () => {
    const app = await buildApp({ env: testEnv });
    expect((await app.inject({ method: 'GET', url: '/api/notifications' })).statusCode).toBe(401);
    await app.close();
  });
});
