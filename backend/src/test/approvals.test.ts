/**
 * Parent approval: the only code that moves a chore out of `submitted`, and the
 * only code that writes to `points_ledger`.
 *
 * This is a child's money. Double payment, silent payment, and payment without
 * anyone looking at the photo all get explicit tests.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';
import '../pg-parsers.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { hashPin } from '../auth/pin.js';
import { SESSION_COOKIE } from '../auth/plugin.js';
import { isPunctual, householdMinutesOfDay, minutesFromClockTime } from '../time.js';
import { testConnectionString } from './database.js';

describe('the punctuality rule', () => {
  const TZ = 'America/Chicago';

  it('reads a clock setting into minutes', () => {
    expect(minutesFromClockTime('20:45:00')).toBe(20 * 60 + 45);
    expect(minutesFromClockTime('00:00:00')).toBe(0);
    expect(minutesFromClockTime('23:00')).toBe(23 * 60);
  });

  it('measures the household wall clock, not UTC', () => {
    // 2026-08-19 20:30 in Chicago is 01:30 the next day in UTC.
    const evening = new Date('2026-08-20T01:30:00Z');
    expect(householdMinutesOfDay(TZ, evening)).toBe(20 * 60 + 30);
  });

  it('is earned before the reminder and lost after it', () => {
    // 20:30 Chicago, comfortably before the 20:45 reminder.
    expect(isPunctual(TZ, '2026-08-19', '20:45:00', new Date('2026-08-20T01:30:00Z'))).toBe(true);
    // 21:10 Chicago, after it.
    expect(isPunctual(TZ, '2026-08-19', '20:45:00', new Date('2026-08-20T02:10:00Z'))).toBe(false);
  });

  it('holds across the daylight saving boundary', () => {
    // 20:30 Chicago on the spring-forward day. A fixed UTC offset would read
    // this as 19:30 or 21:30 depending on which side it guessed.
    expect(isPunctual(TZ, '2026-03-08', '20:45:00', new Date('2026-03-09T01:30:00Z'))).toBe(true);
  });

  it('is never earned by sending in a previous day late', () => {
    // 19:00 on the 20th, for the 19th's chore. Early in the evening, but the
    // deadline belonged to a day that has gone.
    expect(isPunctual(TZ, '2026-08-19', '20:45:00', new Date('2026-08-21T00:00:00Z'))).toBe(false);
  });
});

// --- Needs a database --------------------------------------------------------

const connectionString = testConnectionString;
const describeDb = connectionString ? describe : describe.skip;

const storageRoot = resolve(tmpdir(), `cq-approvals-test-${process.pid}`);

const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '4005',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: 'America/Chicago',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: connectionString,
  SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
  PHOTO_STORAGE_DIR: storageRoot,
} as NodeJS.ProcessEnv);

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);

let pool: pg.Pool;
const createdUsers: string[] = [];
const createdChores: string[] = [];

type App = Awaited<ReturnType<typeof buildApp>>;

async function makeUser(role: 'parent' | 'child', name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (role, display_name, pin_hash, pin_set_at, created_at)
     VALUES ($1, $2, $3, now(), now() - interval '400 days') RETURNING id`,
    [role, name, await hashPin('4821')],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('failed to create user');
  createdUsers.push(id);
  return id;
}

async function makeScheduledChore(childId: string, points = 10): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chore_definitions (name, icon, kind, points)
     VALUES ('Kitchen Cleaning', 'kitchen', 'core', $1) RETURNING id`,
    [points],
  );
  const choreId = rows[0]?.id as string;
  createdChores.push(choreId);

  await pool.query(
    `INSERT INTO chore_subtask_templates (chore_definition_id, position, title)
     VALUES ($1, 0, 'Wash dishes')`,
    [choreId],
  );
  await pool.query(
    `INSERT INTO chore_schedules (chore_definition_id, assigned_to, recurrence, starts_on)
     VALUES ($1, $2, 'daily', '2020-01-01')`,
    [choreId, childId],
  );
  return choreId;
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

function multipart(bytes: Buffer) {
  const boundary = '----choreQuestApprovalBoundary';
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="p.jpg"\r\n` +
          'Content-Type: image/jpeg\r\n\r\n',
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** Takes a child's chore all the way to `submitted`. */
async function submitAChore(
  app: App,
  childCookie: string,
  options: { punctual?: boolean } = {},
): Promise<string> {
  const day = await app.inject({
    method: 'GET',
    url: '/api/child/day',
    headers: { cookie: childCookie },
  });
  const chore = day.json().core[0];

  for (const subtask of chore.subtasks) {
    await app.inject({
      method: 'PATCH',
      url: `/api/chores/${chore.id}/subtasks/${subtask.id}`,
      payload: { done: true },
      headers: { cookie: childCookie },
    });
  }

  const body = multipart(JPEG);
  await app.inject({
    method: 'POST',
    url: `/api/chores/${chore.id}/photos`,
    payload: body.payload,
    headers: { cookie: childCookie, 'content-type': body.contentType },
  });

  await app.inject({
    method: 'POST',
    url: `/api/chores/${chore.id}/submit`,
    headers: { cookie: childCookie, 'content-type': 'application/json' },
  });

  // Punctuality depends on the wall clock when the suite happens to run, so it
  // is set explicitly where a test cares about it.
  if (options.punctual !== undefined) {
    await pool.query('UPDATE chore_instances SET submitted_punctual = $2 WHERE id = $1', [
      chore.id,
      options.punctual,
    ]);
  }
  return chore.id;
}

/** Opens every photo as a parent would, satisfying the rubber-stamp guard. */
async function viewPhotos(app: App, instanceId: string, parentCookie: string): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM chore_photos WHERE chore_instance_id = $1',
    [instanceId],
  );
  for (const row of rows) {
    await app.inject({
      method: 'GET',
      url: `/api/photos/${row.id}`,
      headers: { cookie: parentCookie },
    });
  }
}

async function ledgerFor(childId: string) {
  const { rows } = await pool.query<{ delta: number; reason: string; label: string }>(
    'SELECT delta, reason, label FROM points_ledger WHERE child_id = $1 ORDER BY created_at',
    [childId],
  );
  return rows;
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
  await rm(storageRoot, { recursive: true, force: true });
});

describeDb('approving', () => {
  it('pays the chore and writes the history that explains it', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Approve Child');
    const parent = await makeUser('parent', 'Approve Parent');
    await makeScheduledChore(child, 10);

    const childCookie = await signIn(app, child);
    const instanceId = await submitAChore(app, childCookie, { punctual: false });
    const parentCookie = await signIn(app, parent);
    await viewPhotos(app, instanceId, parentCookie);

    const response = await app.inject({
      method: 'POST',
      url: `/api/parent/approvals/${instanceId}/approve`,
      headers: { cookie: parentCookie, 'content-type': 'application/json' },
    });
    expect(response.statusCode).toBe(200);

    const ledger = await ledgerFor(child);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ delta: 10, reason: 'chore_approved' });
    expect(ledger[0]?.label).toContain('Kitchen Cleaning');
    await app.close();
  });

  it('adds the punctuality bonus as its own line', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Punctual Child');
    const parent = await makeUser('parent', 'Punctual Parent');
    await makeScheduledChore(child, 10);

    const childCookie = await signIn(app, child);
    const instanceId = await submitAChore(app, childCookie, { punctual: true });
    const parentCookie = await signIn(app, parent);
    await viewPhotos(app, instanceId, parentCookie);

    await app.inject({
      method: 'POST',
      url: `/api/parent/approvals/${instanceId}/approve`,
      headers: { cookie: parentCookie, 'content-type': 'application/json' },
    });

    const ledger = await ledgerFor(child);
    // Two rows, not one of 12: the wallet has to be able to say why this chore
    // paid more than the same chore did yesterday.
    expect(ledger.map((r) => r.reason)).toEqual(['chore_approved', 'punctuality_bonus']);
    expect(ledger.reduce((sum, r) => sum + r.delta, 0)).toBe(12);
    await app.close();
  });

  it('pays a chore only once, however many times Approve is tapped', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Double Tap Child');
    const parent = await makeUser('parent', 'Double Tap Parent');
    await makeScheduledChore(child, 10);

    const childCookie = await signIn(app, child);
    const instanceId = await submitAChore(app, childCookie, { punctual: false });
    const parentCookie = await signIn(app, parent);
    await viewPhotos(app, instanceId, parentCookie);

    const approve = () =>
      app.inject({
        method: 'POST',
        url: `/api/parent/approvals/${instanceId}/approve`,
        headers: { cookie: parentCookie, 'content-type': 'application/json' },
      });

    expect((await approve()).statusCode).toBe(200);
    expect((await approve()).statusCode).toBe(409);

    expect(await ledgerFor(child)).toHaveLength(1);
    await app.close();
  });

  it('survives two parents approving the same chore at the same moment', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Race Child');
    const mum = await makeUser('parent', 'Race Parent One');
    const dad = await makeUser('parent', 'Race Parent Two');
    await makeScheduledChore(child, 10);

    const childCookie = await signIn(app, child);
    const instanceId = await submitAChore(app, childCookie, { punctual: false });
    const mumCookie = await signIn(app, mum);
    const dadCookie = await signIn(app, dad);
    await viewPhotos(app, instanceId, mumCookie);

    const [a, b] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/parent/approvals/${instanceId}/approve`,
        headers: { cookie: mumCookie, 'content-type': 'application/json' },
      }),
      app.inject({
        method: 'POST',
        url: `/api/parent/approvals/${instanceId}/approve`,
        headers: { cookie: dadCookie, 'content-type': 'application/json' },
      }),
    ]);

    // Exactly one wins; the row lock decides which.
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect(await ledgerFor(child)).toHaveLength(1);
    await app.close();
  });

  it('refuses to approve a chore whose photo nobody opened', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Unseen Child');
    const parent = await makeUser('parent', 'Hasty Parent');
    await makeScheduledChore(child, 10);

    const childCookie = await signIn(app, child);
    const instanceId = await submitAChore(app, childCookie, { punctual: false });
    const parentCookie = await signIn(app, parent);

    const response = await app.inject({
      method: 'POST',
      url: `/api/parent/approvals/${instanceId}/approve`,
      headers: { cookie: parentCookie, 'content-type': 'application/json' },
    });

    // The specification's rule against rubber-stamping, enforced on the server
    // rather than by disabling a button.
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toMatch(/open the photo/i);
    expect(await ledgerFor(child)).toHaveLength(0);
    await app.close();
  });

  it('will not let a child approve their own chore', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Self Approve Child');
    await makeScheduledChore(child, 10);

    const childCookie = await signIn(app, child);
    const instanceId = await submitAChore(app, childCookie, { punctual: false });

    const response = await app.inject({
      method: 'POST',
      url: `/api/parent/approvals/${instanceId}/approve`,
      headers: { cookie: childCookie, 'content-type': 'application/json' },
    });
    expect(response.statusCode).toBe(403);
    expect(await ledgerFor(child)).toHaveLength(0);
    await app.close();
  });
});

describeDb('rejecting', () => {
  it('requires a note', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Note Child');
    const parent = await makeUser('parent', 'Note Parent');
    await makeScheduledChore(child, 10);

    const childCookie = await signIn(app, child);
    const instanceId = await submitAChore(app, childCookie);
    const parentCookie = await signIn(app, parent);

    for (const payload of [{}, { note: '' }, { note: '   ' }]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/parent/approvals/${instanceId}/reject`,
        payload,
        headers: { cookie: parentCookie, 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });

  it('reopens the chore, clears the checklist, and pays nothing', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Redo Child');
    const parent = await makeUser('parent', 'Redo Parent');
    await makeScheduledChore(child, 10);

    const childCookie = await signIn(app, child);
    const instanceId = await submitAChore(app, childCookie);
    const parentCookie = await signIn(app, parent);

    const response = await app.inject({
      method: 'POST',
      url: `/api/parent/approvals/${instanceId}/reject`,
      payload: { note: 'The mirror still has spots.' },
      headers: { cookie: parentCookie, 'content-type': 'application/json' },
    });
    expect(response.statusCode).toBe(200);

    const { rows } = await pool.query<{ status: string; rejection_note: string }>(
      'SELECT status, rejection_note FROM chore_instances WHERE id = $1',
      [instanceId],
    );
    expect(rows[0]?.status).toBe('rejected');
    expect(rows[0]?.rejection_note).toMatch(/mirror/i);

    // "Check everything again" on the screen has to be true.
    const subtasks = await pool.query<{ done: boolean }>(
      'SELECT done FROM chore_instance_subtasks WHERE chore_instance_id = $1',
      [instanceId],
    );
    expect(subtasks.rows.every((r) => r.done === false)).toBe(true);

    expect(await ledgerFor(child)).toHaveLength(0);
    await app.close();
  });

  it('will not accept the old photo as proof of the fix', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Old Photo Child');
    const parent = await makeUser('parent', 'Old Photo Parent');
    await makeScheduledChore(child, 10);

    const childCookie = await signIn(app, child);
    const instanceId = await submitAChore(app, childCookie);
    const parentCookie = await signIn(app, parent);

    await app.inject({
      method: 'POST',
      url: `/api/parent/approvals/${instanceId}/reject`,
      payload: { note: 'Do the floor too.' },
      headers: { cookie: parentCookie, 'content-type': 'application/json' },
    });

    // Re-tick, but reuse the photo taken before the rejection.
    const detail = await app.inject({
      method: 'GET',
      url: `/api/chores/${instanceId}`,
      headers: { cookie: childCookie },
    });
    for (const subtask of detail.json().chore.subtasks) {
      await app.inject({
        method: 'PATCH',
        url: `/api/chores/${instanceId}/subtasks/${subtask.id}`,
        payload: { done: true },
        headers: { cookie: childCookie },
      });
    }

    const retry = await app.inject({
      method: 'POST',
      url: `/api/chores/${instanceId}/submit`,
      headers: { cookie: childCookie, 'content-type': 'application/json' },
    });
    expect(retry.statusCode).toBe(400);
    expect(retry.json().error.message).toMatch(/new photo/i);

    // With a fresh photo it goes through.
    const body = multipart(JPEG);
    await app.inject({
      method: 'POST',
      url: `/api/chores/${instanceId}/photos`,
      payload: body.payload,
      headers: { cookie: childCookie, 'content-type': body.contentType },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/chores/${instanceId}/submit`,
      headers: { cookie: childCookie, 'content-type': 'application/json' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().chore.status).toBe('submitted');
    await app.close();
  });
});

describeDb('the queue', () => {
  it('lists what is waiting, with whether each photo has been opened', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Queue Child');
    const parent = await makeUser('parent', 'Queue Parent');
    await makeScheduledChore(child, 10);

    const childCookie = await signIn(app, child);
    const instanceId = await submitAChore(app, childCookie);
    const parentCookie = await signIn(app, parent);

    const before = await app.inject({
      method: 'GET',
      url: '/api/parent/approvals',
      headers: { cookie: parentCookie },
    });
    const pending = before.json().pending.find((s: { id: string }) => s.id === instanceId);
    expect(pending.child.displayName).toBe('Queue Child');
    expect(pending.subtasksDone).toBe(pending.subtasksTotal);
    expect(pending.photos[0].viewed).toBe(false);

    await viewPhotos(app, instanceId, parentCookie);

    const after = await app.inject({
      method: 'GET',
      url: '/api/parent/approvals',
      headers: { cookie: parentCookie },
    });
    const seen = after.json().pending.find((s: { id: string }) => s.id === instanceId);
    expect(seen.photos[0].viewed).toBe(true);
    await app.close();
  });

  it('is closed to children and to anyone signed out', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Peeking Child');
    const childCookie = await signIn(app, child);

    expect((await app.inject({ method: 'GET', url: '/api/parent/approvals' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/parent/approvals',
          headers: { cookie: childCookie },
        })
      ).statusCode,
    ).toBe(403);
    await app.close();
  });

  it('approves everything seen and reports what it skipped', async () => {
    const app = await buildApp({ env: testEnv });
    const parent = await makeUser('parent', 'Bulk Parent');
    const seenChild = await makeUser('child', 'Bulk Seen Child');
    const unseenChild = await makeUser('child', 'Bulk Unseen Child');
    await makeScheduledChore(seenChild, 10);
    await makeScheduledChore(unseenChild, 10);

    const seenCookie = await signIn(app, seenChild);
    const unseenCookie = await signIn(app, unseenChild);
    const seenInstance = await submitAChore(app, seenCookie, { punctual: false });
    await submitAChore(app, unseenCookie, { punctual: false });

    const parentCookie = await signIn(app, parent);
    // Only one child's photo gets opened.
    await viewPhotos(app, seenInstance, parentCookie);

    const response = await app.inject({
      method: 'POST',
      url: '/api/parent/approvals/approve-all',
      headers: { cookie: parentCookie, 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().approved).toBe(1);
    expect(response.json().skipped).toHaveLength(1);

    // The one that was actually looked at got paid; the other did not.
    expect(await ledgerFor(seenChild)).toHaveLength(1);
    expect(await ledgerFor(unseenChild)).toHaveLength(0);
    await app.close();
  });
});

describeDb('what the child sees afterwards', () => {
  it('shows the approved points in their balance and their recent win', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Balance Child');
    const parent = await makeUser('parent', 'Balance Parent');
    await makeScheduledChore(child, 10);

    const childCookie = await signIn(app, child);
    const instanceId = await submitAChore(app, childCookie, { punctual: true });
    const parentCookie = await signIn(app, parent);
    await viewPhotos(app, instanceId, parentCookie);
    await app.inject({
      method: 'POST',
      url: `/api/parent/approvals/${instanceId}/approve`,
      headers: { cookie: parentCookie, 'content-type': 'application/json' },
    });

    const day = await app.inject({
      method: 'GET',
      url: '/api/child/day',
      headers: { cookie: childCookie },
    });
    const summary = day.json().summary;

    expect(summary.spendablePoints).toBe(12);
    expect(summary.lifetimePoints).toBe(12);
    expect(summary.recentWin.label).toContain('Kitchen Cleaning');
    // The day's core chore is approved, so the streak counts it.
    expect(summary.streakDays).toBe(1);
    await app.close();
  });
});
