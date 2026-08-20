import { execFile } from 'node:child_process';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { Env } from '../env.js';
import { householdToday } from '../time.js';

const run = promisify(execFile);

/**
 * Backups.
 *
 * A household's whole history lives in one Postgres database and one folder of
 * photos on one laptop. Losing either loses months of a child's earned points,
 * which is not recoverable by re-entering it - nobody remembers which chores
 * were done on which Tuesday.
 *
 * Both halves are taken together, always. A database restored without its
 * photos is a set of approved chores whose proof has vanished, and a folder of
 * photos with no database is a pile of unnamed JPEGs. Neither is a backup of
 * anything on its own.
 *
 * The nightly run is a reconciliation, like the reminder sweep: it asks whether
 * today already has a backup, not whether a timer fired at 3am. A laptop that
 * was restarting at 3am gets its backup at 3:15, and a laptop that was off all
 * night gets one the moment it comes back.
 */

/** Household-local hour the nightly backup is taken after. */
const BACKUP_HOUR = 3;

/**
 * Owner decision: fourteen days of nightly backups, then eight weeks of
 * Sundays. That is roughly four months of history - long enough to catch a
 * mistake noticed the same fortnight and one noticed a season later - for about
 * fifteen times the size of the database.
 */
export const KEEP_DAILY = 14;
export const KEEP_WEEKLY = 8;

/** Names inside one backup folder. The restore CLI reads the same names. */
export const DUMP_FILE = 'database.dump';
export const PHOTO_DIR = 'photos';
export const MANIFEST_FILE = 'manifest.json';

export interface BackupManifest {
  takenAt: string;
  choreDate: string;
  kind: 'scheduled' | 'manual';
  /** So a restore can refuse a dump from a schema it does not understand. */
  migration: string | null;
  photoCount: number;
  databaseBytes: number;
}

export interface BackupResult {
  id: string;
  directory: string;
  bytes: number;
  photoCount: number;
  mirroredTo: string | null;
}

function folderName(now: Date): string {
  // Sortable, filesystem-safe, and readable at a glance in Explorer.
  return now.toISOString().replace(/[:.]/g, '-').replace('Z', '');
}

async function directorySize(dir: string): Promise<number> {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += await directorySize(full);
    else total += (await stat(full)).size;
  }
  return total;
}

async function countFiles(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    return entries.filter((entry) => entry.isFile()).length;
  } catch {
    // No photos yet is not a problem; a household starts with none.
    return 0;
  }
}

/** True when the mirror path is present and is a directory we can write into. */
export async function mirrorAvailable(env: Env): Promise<boolean> {
  if (!env.BACKUP_MIRROR_DIR) return false;
  try {
    return (await stat(env.BACKUP_MIRROR_DIR)).isDirectory();
  } catch {
    // The ordinary case: the drive is not plugged in.
    return false;
  }
}

function absolute(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

/**
 * Takes one backup: the database, then the photos, then a manifest tying them
 * together.
 *
 * The row is written before the work starts so a crash halfway leaves a
 * 'running' record rather than no evidence at all - a backup that vanished
 * without trace is indistinguishable from one that was never attempted, and
 * that is the distinction the whole table exists for.
 */
export async function runBackup(
  db: pg.Pool,
  env: Env,
  log: FastifyBaseLogger,
  kind: 'scheduled' | 'manual',
  now = new Date(),
): Promise<BackupResult> {
  if (!env.DATABASE_URL) throw new Error('No DATABASE_URL, so there is nothing to back up.');

  const choreDate = householdToday(env.HOUSEHOLD_TZ, now);
  const root = absolute(env.BACKUP_DIR);
  const directory = join(root, folderName(now));

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO backups (status, kind, chore_date, directory)
     VALUES ('running', $1, $2::date, $3) RETURNING id`,
    [kind, choreDate, directory],
  );
  const id = rows[0]?.id as string;

  try {
    await mkdir(directory, { recursive: true });

    // Custom format: compressed, and pg_restore can rebuild from it selectively
    // if only part of the schema is ever needed. --no-owner because the
    // restoring role is whatever the laptop has, not whatever wrote the dump.
    await run('pg_dump', [
      `--dbname=${env.DATABASE_URL}`,
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--file=${join(directory, DUMP_FILE)}`,
    ]);

    const photoSource = absolute(env.PHOTO_STORAGE_DIR);
    let photoCount = 0;
    try {
      await stat(photoSource);
      await cp(photoSource, join(directory, PHOTO_DIR), { recursive: true });
      photoCount = await countFiles(join(directory, PHOTO_DIR));
    } catch {
      // No photo folder yet. Not an error - it appears with the first photo.
    }

    const databaseBytes = (await stat(join(directory, DUMP_FILE))).size;
    const { rows: migration } = await db.query<{ name: string }>(
      'SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1',
    );

    const manifest: BackupManifest = {
      takenAt: now.toISOString(),
      choreDate,
      kind,
      migration: migration[0]?.name ?? null,
      photoCount,
      databaseBytes,
    };
    await writeFile(join(directory, MANIFEST_FILE), JSON.stringify(manifest, null, 2));

    const bytes = await directorySize(directory);

    // The copy that survives the laptop. Deliberately last: a mirror that fails
    // must not cost the household the backup that already succeeded locally.
    let mirroredTo: string | null = null;
    if (await mirrorAvailable(env)) {
      try {
        const target = join(env.BACKUP_MIRROR_DIR as string, folderName(now));
        await cp(directory, target, { recursive: true });
        mirroredTo = target;
      } catch (error) {
        log.warn({ err: error }, 'backup mirror failed');
      }
    }

    await db.query(
      `UPDATE backups
          SET status = 'ok', finished_at = now(), bytes = $2,
              photo_count = $3, mirrored_at = $4, mirror_path = $5
        WHERE id = $1`,
      [id, bytes, photoCount, mirroredTo ? now : null, mirroredTo],
    );

    return { id, directory, bytes, photoCount, mirroredTo };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.query(
      `UPDATE backups SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
      [id, message.slice(0, 500)],
    );
    // The folder is half-written and worse than useless: a restore that found
    // it would be restoring an incomplete household.
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Deletes what the retention rule no longer covers.
 *
 * Keeps the newest `KEEP_DAILY` successful backups outright, then one per ISO
 * week for `KEEP_WEEKLY` weeks beyond them. Failed rows are kept as history -
 * they hold no files, and "the backup failed three nights running" is exactly
 * the kind of thing worth still being able to read.
 */
export async function pruneBackups(
  db: pg.Pool,
  log: FastifyBaseLogger,
): Promise<{ removed: number }> {
  const { rows } = await db.query<{ id: string; directory: string; chore_date: string }>(
    `SELECT id, directory, to_char(chore_date, 'YYYY-MM-DD') AS chore_date
       FROM backups
      WHERE status = 'ok'
      ORDER BY started_at DESC`,
  );

  const keep = new Set<string>();
  const weeksKept = new Set<string>();

  rows.forEach((row, index) => {
    if (index < KEEP_DAILY) {
      keep.add(row.id);
      return;
    }
    // Beyond the daily window, one per calendar week until the weekly quota is
    // full. Rows are newest first, so the one kept is the newest in its week.
    const week = isoWeek(row.chore_date);
    if (weeksKept.size < KEEP_WEEKLY || weeksKept.has(week)) {
      if (!weeksKept.has(week)) {
        weeksKept.add(week);
        keep.add(row.id);
      }
    }
  });

  let removed = 0;
  for (const row of rows) {
    if (keep.has(row.id)) continue;
    try {
      await rm(row.directory, { recursive: true, force: true });
      await db.query('DELETE FROM backups WHERE id = $1', [row.id]);
      removed += 1;
    } catch (error) {
      // A folder that will not delete is not worth failing the night over; the
      // next prune reconsiders it.
      log.warn({ err: error, directory: row.directory }, 'could not remove old backup');
    }
  }

  return { removed };
}

/** ISO year-week, so a week that spans New Year is still one week. */
function isoWeek(choreDate: string): string {
  const date = new Date(`${choreDate}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

/**
 * Takes the night's backup if it is due and has not happened.
 *
 * Asks the database what exists rather than trusting a timer, so this is safe
 * to call every tick and produces exactly one backup per household day however
 * often the server restarts.
 */
export async function backupIfDue(
  db: pg.Pool,
  env: Env,
  log: FastifyBaseLogger,
  now = new Date(),
): Promise<BackupResult | null> {
  const choreDate = householdToday(env.HOUSEHOLD_TZ, now);
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: env.HOUSEHOLD_TZ,
      hour: '2-digit',
      hour12: false,
    }).format(now),
  );
  if (hour < BACKUP_HOUR) return null;

  const { rows } = await db.query(
    `SELECT 1 FROM backups WHERE chore_date = $1::date AND kind = 'scheduled'`,
    [choreDate],
  );
  if (rows.length > 0) return null;

  const result = await runBackup(db, env, log, 'scheduled', now);
  await pruneBackups(db, log);
  return result;
}
