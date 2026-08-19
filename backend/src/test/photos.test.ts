/**
 * Photo storage, serving, and chore submission.
 *
 * These are pictures taken inside a family's home by children, so the access
 * rules get the same treatment as authentication: proven, not assumed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';
import '../pg-parsers.js';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { hashPin } from '../auth/pin.js';
import { SESSION_COOKIE } from '../auth/plugin.js';
import { ensureDaysMaterialized } from '../chores/materialize.js';
import { detectFormat, resolveStoredPath, storePhoto } from '../photos/storage.js';

/** Smallest bytes that still sniff as each format. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4, 0),
  Buffer.from('WEBP'),
  Buffer.alloc(64, 7),
]);

describe('format sniffing', () => {
  it('recognises the formats a phone camera produces', () => {
    expect(detectFormat(JPEG)).toBe('jpeg');
    expect(detectFormat(PNG)).toBe('png');
    expect(detectFormat(WEBP)).toBe('webp');
  });

  it('refuses anything that is not an image, whatever it claims to be', () => {
    // A renamed script is the attack this guards: it would be written to disk
    // and served back to a browser later.
    expect(detectFormat(Buffer.from('<?php echo 1; ?>'))).toBeNull();
    expect(detectFormat(Buffer.from('GIF89a'))).toBeNull(); // deliberately unsupported
    expect(detectFormat(Buffer.alloc(0))).toBeNull();
    expect(detectFormat(Buffer.from('short'))).toBeNull();
  });
});

describe('stored paths stay inside the storage directory', () => {
  const root = resolve(tmpdir(), 'cq-photo-root');

  it('resolves a normal path', () => {
    expect(resolveStoredPath(root, '2026/08/19/abc.jpg')).toBe(
      join(root, '2026', '08', '19', 'abc.jpg'),
    );
  });

  it('refuses to climb out', () => {
    for (const bad of [
      '../../../etc/passwd',
      '2026/../../../../secrets.env',
      '..\\..\\windows\\system32\\config\\sam',
    ]) {
      expect(() => resolveStoredPath(root, bad)).toThrow(/outside the storage directory/);
    }
  });
});

describe('writing a photo', () => {
  const root = resolve(tmpdir(), `cq-store-${process.pid}`);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('shards by household date and records what the database needs', async () => {
    const stored = await storePhoto(root, JPEG, '2026-08-19');
    expect(stored.filePath).toMatch(/^2026\/08\/19\/[0-9a-f-]{36}\.jpg$/);
    expect(stored.byteSize).toBe(JPEG.length);
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await readFile(join(root, stored.filePath))).toEqual(JPEG);
  });

  it('gives identical photos different names', async () => {
    // Content-addressed names would collide here, and deleting one chore's
    // proof would silently remove another's.
    const a = await storePhoto(root, JPEG, '2026-08-19');
    const b = await storePhoto(root, JPEG, '2026-08-19');
    expect(a.filePath).not.toBe(b.filePath);
    expect(a.sha256).toBe(b.sha256);
  });

  it('refuses bytes that are not an image', async () => {
    await expect(storePhoto(root, Buffer.from('not an image at all'), '2026-08-19')).rejects.toThrow(
      /not a recognised image/i,
    );
  });
});

// --- Needs a database --------------------------------------------------------

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

const storageRoot = resolve(tmpdir(), `cq-photos-test-${process.pid}`);

const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '4004',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: 'America/Chicago',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: connectionString,
  SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
  PHOTO_STORAGE_DIR: storageRoot,
} as NodeJS.ProcessEnv);

let pool: pg.Pool;
const createdUsers: string[] = [];
const createdChores: string[] = [];

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

async function makeScheduledChore(childId: string, subtasks: string[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chore_definitions (name, icon, kind, points)
     VALUES ('Kitchen', 'kitchen', 'core', 10) RETURNING id`,
  );
  const choreId = rows[0]?.id as string;
  createdChores.push(choreId);

  for (const [index, title] of subtasks.entries()) {
    await pool.query(
      `INSERT INTO chore_subtask_templates (chore_definition_id, position, title)
       VALUES ($1, $2, $3)`,
      [choreId, index, title],
    );
  }
  await pool.query(
    `INSERT INTO chore_schedules (chore_definition_id, assigned_to, recurrence, starts_on)
     VALUES ($1, $2, 'daily', '2020-01-01')`,
    [choreId, childId],
  );
  return choreId;
}

async function signIn(app: Awaited<ReturnType<typeof buildApp>>, userId: string): Promise<string> {
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

/** Builds a multipart body by hand; no helper library for one field. */
function multipartBody(bytes: Buffer, filename = 'proof.jpg', mime = 'image/jpeg') {
  const boundary = '----choreQuestTestBoundary';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, bytes, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

/** Signs a child in, materialises today, and returns their first chore. */
async function openChore(
  app: Awaited<ReturnType<typeof buildApp>>,
  childId: string,
  cookie: string,
): Promise<{ id: string; subtasks: { id: string }[] }> {
  const day = await app.inject({ method: 'GET', url: '/api/child/day', headers: { cookie } });
  return day.json().core[0];
}

async function tickEverything(
  app: Awaited<ReturnType<typeof buildApp>>,
  chore: { id: string; subtasks: { id: string }[] },
  cookie: string,
): Promise<void> {
  for (const subtask of chore.subtasks) {
    await app.inject({
      method: 'PATCH',
      url: `/api/chores/${chore.id}/subtasks/${subtask.id}`,
      payload: { done: true },
      headers: { cookie },
    });
  }
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

describeDb('uploading proof', () => {
  it('accepts a photo and writes it to disk', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Photo Child');
    await makeScheduledChore(child, ['Wash dishes']);
    const cookie = await signIn(app, child);
    const chore = await openChore(app, child, cookie);

    const response = await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/photos`,
      ...multipartBody(JPEG),
      headers: { ...multipartBody(JPEG).headers, cookie },
    });

    expect(response.statusCode).toBe(200);
    const { rows } = await pool.query<{ file_path: string; sha256: string }>(
      'SELECT file_path, sha256 FROM chore_photos WHERE chore_instance_id = $1',
      [chore.id],
    );
    expect(rows).toHaveLength(1);
    expect(existsSync(join(storageRoot, rows[0]!.file_path))).toBe(true);
    await app.close();
  });

  it('refuses a renamed non-image whatever the content type claims', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Sneaky Child');
    await makeScheduledChore(child, ['Wash dishes']);
    const cookie = await signIn(app, child);
    const chore = await openChore(app, child, cookie);

    const evil = Buffer.from('<?php system($_GET["c"]); ?>');
    const body = multipartBody(evil, 'proof.jpg', 'image/jpeg');
    const response = await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/photos`,
      payload: body.payload,
      headers: { ...body.headers, cookie },
    });

    expect(response.statusCode).toBe(415);
    const { rows } = await pool.query('SELECT 1 FROM chore_photos WHERE chore_instance_id = $1', [
      chore.id,
    ]);
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('will not let a child attach proof to a sibling\'s chore', async () => {
    const app = await buildApp({ env: testEnv });
    const mine = await makeUser('child', 'Uploader Child');
    const theirs = await makeUser('child', 'Victim Child');
    await makeScheduledChore(theirs, ['Wash dishes']);

    const theirCookie = await signIn(app, theirs);
    const chore = await openChore(app, theirs, theirCookie);

    const myCookie = await signIn(app, mine);
    const body = multipartBody(JPEG);
    const response = await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/photos`,
      payload: body.payload,
      headers: { ...body.headers, cookie: myCookie },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('refuses more than five photos on one chore', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Prolific Child');
    await makeScheduledChore(child, ['Wash dishes']);
    const cookie = await signIn(app, child);
    const chore = await openChore(app, child, cookie);

    for (let i = 0; i < 5; i += 1) {
      const body = multipartBody(JPEG);
      const ok = await app.inject({
        method: 'POST',
        url: `/api/chores/${chore.id}/photos`,
        payload: body.payload,
        headers: { ...body.headers, cookie },
      });
      expect(ok.statusCode).toBe(200);
    }

    const body = multipartBody(JPEG);
    const sixth = await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/photos`,
      payload: body.payload,
      headers: { ...body.headers, cookie },
    });
    expect(sixth.statusCode).toBe(409);
    await app.close();
  });
});

describeDb('serving a photo', () => {
  async function uploadOne(
    app: Awaited<ReturnType<typeof buildApp>>,
    choreId: string,
    cookie: string,
  ): Promise<string> {
    const body = multipartBody(JPEG);
    const response = await app.inject({
      method: 'POST',
      url: `/api/chores/${choreId}/photos`,
      payload: body.payload,
      headers: { ...body.headers, cookie },
    });
    return response.json().photo.id;
  }

  it('serves it to its owner with a content type this server chose', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Owner Child');
    await makeScheduledChore(child, ['Wash dishes']);
    const cookie = await signIn(app, child);
    const chore = await openChore(app, child, cookie);
    const photoId = await uploadOne(app, chore.id, cookie);

    const response = await app.inject({
      method: 'GET',
      url: `/api/photos/${photoId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    // Household data behind a tunnel must never sit in a shared cache.
    expect(String(response.headers['cache-control'])).toContain('private');
    await app.close();
  });

  it('refuses it to a signed-out visitor and to another child', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Private Child');
    const sibling = await makeUser('child', 'Nosy Child');
    await makeScheduledChore(child, ['Wash dishes']);
    const cookie = await signIn(app, child);
    const chore = await openChore(app, child, cookie);
    const photoId = await uploadOne(app, chore.id, cookie);

    const anonymous = await app.inject({ method: 'GET', url: `/api/photos/${photoId}` });
    expect(anonymous.statusCode).toBe(401);

    const siblingCookie = await signIn(app, sibling);
    const nosy = await app.inject({
      method: 'GET',
      url: `/api/photos/${photoId}`,
      headers: { cookie: siblingCookie },
    });
    expect(nosy.statusCode).toBe(404);
    await app.close();
  });

  it('lets a parent see it, and records who looked first', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Reviewed Child');
    const parent = await makeUser('parent', 'Reviewing Parent');
    await makeScheduledChore(child, ['Wash dishes']);
    const childCookie = await signIn(app, child);
    const chore = await openChore(app, child, childCookie);
    const photoId = await uploadOne(app, chore.id, childCookie);

    const before = await pool.query('SELECT first_viewed_at FROM chore_photos WHERE id = $1', [photoId]);
    expect(before.rows[0]?.first_viewed_at).toBeNull();

    const parentCookie = await signIn(app, parent);
    const seen = await app.inject({
      method: 'GET',
      url: `/api/photos/${photoId}`,
      headers: { cookie: parentCookie },
    });
    expect(seen.statusCode).toBe(200);

    // This is what "Approve all" waits on in the approval queue.
    const after = await pool.query<{ first_viewed_at: Date | null; first_viewed_by: string | null }>(
      'SELECT first_viewed_at, first_viewed_by FROM chore_photos WHERE id = $1',
      [photoId],
    );
    expect(after.rows[0]?.first_viewed_at).not.toBeNull();
    expect(after.rows[0]?.first_viewed_by).toBe(parent);
    await app.close();
  });

  it('does not blame the child when a file has gone missing', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Missing File Child');
    await makeScheduledChore(child, ['Wash dishes']);
    const cookie = await signIn(app, child);
    const chore = await openChore(app, child, cookie);
    const photoId = await uploadOne(app, chore.id, cookie);

    const { rows } = await pool.query<{ file_path: string }>(
      'SELECT file_path FROM chore_photos WHERE id = $1',
      [photoId],
    );
    await rm(join(storageRoot, rows[0]!.file_path), { force: true });

    const response = await app.inject({
      method: 'GET',
      url: `/api/photos/${photoId}`,
      headers: { cookie },
    });
    // 404, not a 500 stack trace.
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describeDb('submitting for review', () => {
  it('refuses without a photo, however complete the checklist', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'No Photo Child');
    await makeScheduledChore(child, ['Wash dishes', 'Sweep floor']);
    const cookie = await signIn(app, child);
    const chore = await openChore(app, child, cookie);
    await tickEverything(app, chore, cookie);

    const response = await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/submit`,
      headers: { cookie, 'content-type': 'application/json' },
    });

    // Photo-required completion is a specification rule, so it is enforced on
    // the server and not only by hiding a button.
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/photo/i);
    await app.close();
  });

  it('refuses with steps outstanding, even with a photo', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Half Done Child');
    await makeScheduledChore(child, ['Wash dishes', 'Sweep floor']);
    const cookie = await signIn(app, child);
    const chore = await openChore(app, child, cookie);

    const body = multipartBody(JPEG);
    await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/photos`,
      payload: body.payload,
      headers: { ...body.headers, cookie },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/submit`,
      headers: { cookie, 'content-type': 'application/json' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/every step/i);
    await app.close();
  });

  it('accepts a finished chore with proof, and will not take it twice', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Finished Child');
    await makeScheduledChore(child, ['Wash dishes']);
    const cookie = await signIn(app, child);
    const chore = await openChore(app, child, cookie);
    await tickEverything(app, chore, cookie);

    const body = multipartBody(JPEG);
    await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/photos`,
      payload: body.payload,
      headers: { ...body.headers, cookie },
    });

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/submit`,
      headers: { cookie, 'content-type': 'application/json' },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().chore.status).toBe('submitted');

    // A double tap on a slow connection must not resubmit.
    const again = await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/submit`,
      headers: { cookie, 'content-type': 'application/json' },
    });
    expect(again.statusCode).toBe(409);
    await app.close();
  });

  it('will not accept more proof once a chore is waiting for review', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Sealed Child');
    await makeScheduledChore(child, ['Wash dishes']);
    const cookie = await signIn(app, child);
    const chore = await openChore(app, child, cookie);
    await tickEverything(app, chore, cookie);

    const first = multipartBody(JPEG);
    await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/photos`,
      payload: first.payload,
      headers: { ...first.headers, cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/submit`,
      headers: { cookie, 'content-type': 'application/json' },
    });

    const second = multipartBody(JPEG);
    const late = await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/photos`,
      payload: second.payload,
      headers: { ...second.headers, cookie },
    });
    // Swapping the evidence after a parent has been asked to look at it.
    expect(late.statusCode).toBe(409);
    await app.close();
  });

  it('lets a rejected chore be fixed and sent again', async () => {
    const app = await buildApp({ env: testEnv });
    const child = await makeUser('child', 'Second Try Child');
    await makeScheduledChore(child, ['Wash dishes']);
    const cookie = await signIn(app, child);
    const chore = await openChore(app, child, cookie);
    await tickEverything(app, chore, cookie);

    const body = multipartBody(JPEG);
    await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/photos`,
      payload: body.payload,
      headers: { ...body.headers, cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/submit`,
      headers: { cookie, 'content-type': 'application/json' },
    });

    await pool.query(
      `UPDATE chore_instances SET status = 'rejected', rejection_note = 'Mirror still has spots.'
        WHERE id = $1`,
      [chore.id],
    );

    const retry = await app.inject({
      method: 'POST',
      url: `/api/chores/${chore.id}/submit`,
      headers: { cookie, 'content-type': 'application/json' },
    });
    expect(retry.statusCode).toBe(200);
    // Resubmitting clears the old note; it no longer describes this attempt.
    expect(retry.json().chore.rejectionNote).toBeNull();
    await app.close();
  });
});
