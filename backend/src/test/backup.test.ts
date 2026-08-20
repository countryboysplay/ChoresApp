/**
 * Backups.
 *
 * A backup that has never been restored is not a backup, so the central test
 * here does not stop at "a file appeared" - it reads the archive back and
 * checks the household is inside it. Everything else is about the properties
 * that make the nightly run trustworthy: exactly one per day however often the
 * server restarts, a failure that leaves a record rather than silence, and no
 * half-written folder left behind for a restore to find.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import '../pg-parsers.js';
import { loadEnv } from '../env.js';
import { hashPin } from '../auth/pin.js';
import {
  backupIfDue,
  DUMP_FILE,
  MANIFEST_FILE,
  PHOTO_DIR,
  pruneBackups,
  runBackup,
  type BackupManifest,
} from '../backup/service.js';
import { testConnectionString } from './database.js';

const run = promisify(execFile);

const connectionString = testConnectionString;

/**
 * pg_dump refuses to talk to a server newer than itself, so a laptop with an
 * older client would fail these for a reason that has nothing to do with the
 * code. Skipping with a visible reason beats a red suite nobody can act on.
 */
async function pgDumpUsable(): Promise<boolean> {
  if (!connectionString) return false;
  try {
    await run('pg_dump', [`--dbname=${connectionString}`, '--schema-only', '--file=/dev/null']);
    return true;
  } catch {
    try {
      // Windows has no /dev/null; try again against a throwaway path.
      const probe = join(await mkdtemp(join(tmpdir(), 'cq-probe-')), 'probe.sql');
      await run('pg_dump', [`--dbname=${connectionString}`, '--schema-only', `--file=${probe}`]);
      return true;
    } catch {
      return false;
    }
  }
}

const usable = await pgDumpUsable();
const describeDb = connectionString && usable ? describe : describe.skip;

if (connectionString && !usable) {
  console.warn('backup tests skipped: pg_dump is missing or older than the server');
}

const TZ = 'America/Chicago';

let pool: pg.Pool;
let workDir: string;
const createdUsers: string[] = [];

const log = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Parameters<typeof runBackup>[2];

function envFor(dirs: { backups: string; photos: string; mirror?: string }) {
  return loadEnv({
    NODE_ENV: 'test',
    PORT: '4012',
    HOST: '127.0.0.1',
    HOUSEHOLD_TZ: TZ,
    CORS_ORIGINS: 'http://localhost:5173',
    DATABASE_URL: connectionString,
    SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
    BACKUP_DIR: dirs.backups,
    PHOTO_STORAGE_DIR: dirs.photos,
    BACKUP_MIRROR_DIR: dirs.mirror,
  } as NodeJS.ProcessEnv);
}

async function makeUser(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (role, display_name, pin_hash, pin_set_at)
     VALUES ('child', $1, $2, now()) RETURNING id`,
    [name, await hashPin('4821')],
  );
  const id = rows[0]?.id as string;
  createdUsers.push(id);
  return id;
}

beforeAll(async () => {
  if (!connectionString || !usable) return;
  pool = new pg.Pool({ connectionString, max: 4 });
  workDir = await mkdtemp(join(tmpdir(), 'cq-backup-'));
});

afterEach(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM backups');
  if (createdUsers.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUsers]);
    createdUsers.length = 0;
  }
});

afterAll(async () => {
  await pool?.end();
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describeDb('taking a backup', () => {
  it('writes an archive that reads back with the household inside it', async () => {
    const name = `Backed Up ${Date.now()}`;
    await makeUser(name);

    const backups = join(workDir, 'restorable');
    const env = envFor({ backups, photos: join(workDir, 'no-photos') });
    const result = await runBackup(pool, env, log, 'manual');

    // Not "a file appeared" - the archive is decoded back to SQL and the
    // household is looked for inside it. This is the whole point of the stage.
    const decoded = join(workDir, 'decoded.sql');
    await run('pg_restore', ['--no-owner', '--no-privileges', `--file=${decoded}`, join(result.directory, DUMP_FILE)]);
    const sql = await readFile(decoded, 'utf8');

    expect(sql).toContain('CREATE TABLE public.users');
    expect(sql).toContain('CREATE TABLE public.chore_instances');
    expect(sql).toContain(name);
  });

  it('records what it took, so a screen can say when it last worked', async () => {
    const env = envFor({ backups: join(workDir, 'recorded'), photos: join(workDir, 'no-photos') });
    await runBackup(pool, env, log, 'manual');

    const { rows } = await pool.query<{ status: string; kind: string; bytes: string }>(
      'SELECT status, kind, bytes FROM backups',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('ok');
    expect(rows[0]?.kind).toBe('manual');
    expect(Number(rows[0]?.bytes)).toBeGreaterThan(0);
  });

  it('takes the photos with the database, because neither is a backup alone', async () => {
    const photos = join(workDir, 'with-photos');
    await mkdir(join(photos, '2026', '08'), { recursive: true });
    await writeFile(join(photos, '2026', '08', 'proof.jpg'), 'not really a jpeg');

    const env = envFor({ backups: join(workDir, 'photo-backup'), photos });
    const result = await runBackup(pool, env, log, 'manual');

    expect(result.photoCount).toBe(1);
    await expect(stat(join(result.directory, PHOTO_DIR, '2026', '08', 'proof.jpg'))).resolves.toBeTruthy();
  });

  it('writes a manifest naming the schema it came from', async () => {
    const env = envFor({ backups: join(workDir, 'manifest'), photos: join(workDir, 'no-photos') });
    const result = await runBackup(pool, env, log, 'manual');

    const manifest = JSON.parse(
      await readFile(join(result.directory, MANIFEST_FILE), 'utf8'),
    ) as BackupManifest;

    // A restore refuses a folder with no manifest, because that is what a
    // half-written backup looks like from the outside.
    expect(manifest.kind).toBe('manual');
    expect(manifest.migration).toMatch(/^\d+_/);
    expect(manifest.databaseBytes).toBeGreaterThan(0);
  });

  it('copies to the drive when it is plugged in', async () => {
    const mirror = join(workDir, 'usb');
    await mkdir(mirror, { recursive: true });

    const env = envFor({ backups: join(workDir, 'mirrored'), photos: join(workDir, 'no-photos'), mirror });
    const result = await runBackup(pool, env, log, 'manual');

    expect(result.mirroredTo).not.toBeNull();
    await expect(stat(join(result.mirroredTo as string, DUMP_FILE))).resolves.toBeTruthy();

    const { rows } = await pool.query('SELECT mirrored_at FROM backups');
    expect(rows[0]?.mirrored_at).not.toBeNull();
  });

  it('still succeeds when the drive is not plugged in', async () => {
    const env = envFor({
      backups: join(workDir, 'unplugged'),
      photos: join(workDir, 'no-photos'),
      mirror: join(workDir, 'a-drive-that-is-not-there'),
    });

    // The ordinary case, and never a failure: the local backup is what was
    // asked for, and the screen says separately whether a copy left the laptop.
    const result = await runBackup(pool, env, log, 'manual');
    expect(result.mirroredTo).toBeNull();
    expect(result.bytes).toBeGreaterThan(0);
  });

  it('leaves no half-written folder behind when it fails', async () => {
    const backups = join(workDir, 'failing');
    const env = { ...envFor({ backups, photos: join(workDir, 'no-photos') }), DATABASE_URL: 'postgres://nobody@127.0.0.1:1/nothing' };

    await expect(runBackup(pool, env, log, 'manual')).rejects.toThrow();

    // A folder containing a truncated dump is worse than no folder at all: a
    // restore would find it and rebuild an incomplete household from it.
    const left = await readdir(backups).catch(() => []);
    expect(left).toHaveLength(0);

    const { rows } = await pool.query<{ status: string; error: string }>(
      'SELECT status, error FROM backups',
    );
    // The failure is recorded rather than silent - "no backup last night" has
    // to be something the screen can say out loud.
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.error).toBeTruthy();
  });
});

describeDb('the nightly run', () => {
  const AFTER_3AM = new Date('2026-08-20T09:30:00Z');
  const BEFORE_3AM = new Date('2026-08-20T06:30:00Z');

  it('says nothing before the backup hour', async () => {
    const env = envFor({ backups: join(workDir, 'early'), photos: join(workDir, 'no-photos') });
    expect(await backupIfDue(pool, env, log, BEFORE_3AM)).toBeNull();
  });

  it('takes one backup a day, however many times it is asked', async () => {
    const env = envFor({ backups: join(workDir, 'nightly'), photos: join(workDir, 'no-photos') });

    expect(await backupIfDue(pool, env, log, AFTER_3AM)).not.toBeNull();
    // Every tick asks. A restart at 4am must not produce a second copy.
    expect(await backupIfDue(pool, env, log, AFTER_3AM)).toBeNull();
    expect(await backupIfDue(pool, env, log, AFTER_3AM)).toBeNull();

    const { rows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int n FROM backups WHERE kind = 'scheduled'",
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('still runs after a restart that missed 3am', async () => {
    const env = envFor({ backups: join(workDir, 'late'), photos: join(workDir, 'no-photos') });
    // Nothing depends on the process having been alive at a particular instant.
    const result = await backupIfDue(pool, env, log, new Date('2026-08-20T16:00:00Z'));
    expect(result).not.toBeNull();
  });
});

describeDb('retention', () => {
  /** Rows only - the folders they name never existed, which prune tolerates. */
  async function fakeBackups(days: number[]): Promise<void> {
    for (const day of days) {
      const date = new Date(Date.UTC(2026, 0, 1));
      date.setUTCDate(date.getUTCDate() + day);
      const iso = date.toISOString().slice(0, 10);
      await pool.query(
        `INSERT INTO backups (status, kind, chore_date, directory, started_at, bytes)
         VALUES ('ok', 'scheduled', $1::date, $2, $1::timestamptz, 1)`,
        [iso, join(workDir, 'gone', iso)],
      );
    }
  }

  it('keeps a fortnight of nights, then thins to weeks', async () => {
    // 120 consecutive days: far past both windows in one go.
    await fakeBackups(Array.from({ length: 120 }, (_, index) => index));

    await pruneBackups(pool, log);

    const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int n FROM backups WHERE status = 'ok'");
    // Fourteen dailies plus at most eight weeklies, and never more.
    expect(rows[0]?.n).toBeLessThanOrEqual(22);
    expect(rows[0]?.n).toBeGreaterThanOrEqual(20);
  });

  it('keeps every backup while there are fewer than a fortnight of them', async () => {
    await fakeBackups([1, 2, 3, 4, 5]);
    await pruneBackups(pool, log);

    const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int n FROM backups');
    expect(rows[0]?.n).toBe(5);
  });

  it('keeps a failed attempt as history, since it holds no files anyway', async () => {
    await pool.query(
      `INSERT INTO backups (status, kind, chore_date, directory, error)
       VALUES ('failed', 'scheduled', '2020-01-01'::date, $1, 'pg_dump exploded')`,
      [join(workDir, 'never')],
    );
    await pruneBackups(pool, log);

    const { rows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int n FROM backups WHERE status = 'failed'",
    );
    // "It failed three nights running" is exactly what should still be readable.
    expect(rows[0]?.n).toBe(1);
  });
});
