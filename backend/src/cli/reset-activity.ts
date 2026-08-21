import { createInterface } from 'node:readline/promises';
import { readdir, rm } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../env.js';
import { closePool, getPool } from '../db.js';
import { runBackup } from '../backup/service.js';
import { householdToday } from '../time.js';

/**
 * Empties the household of everything the children did, and nothing else.
 *
 * For the gap between building a household and handing it to the children. Every
 * chore ticked, point awarded and photo taken while a parent was working out
 * whether the thing worked is indistinguishable, afterwards, from the real
 * article - and a first week that starts with somebody else's streak and
 * somebody else's balance is not a first week.
 *
 * Terminal only, and for the same reason as restore: it cannot be undone, and
 * nothing an argument or a mis-tap can reach should be able to do it. Unlike
 * restore it is safe to run with the server up, which is the point of doing the
 * whole thing in one transaction - see below.
 *
 *   npm run reset-activity -w backend -- --dry-run
 *   npm run reset-activity -w backend
 */

/*
 * Deleted parents-last, so this never depends on what a foreign key was
 * declared to cascade. The order is the dependency order read backwards.
 */
const ACTIVITY_TABLES = [
  'child_achievements',
  'cash_out_requests',
  'child_reward_preferences',
  'notifications',
  'reward_redemptions',
  'points_ledger',
  'chore_photos',
  'chore_instance_subtasks',
  'chore_instances',
] as const;

interface Args {
  dryRun?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const flag of argv) {
    if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--help' || flag === '-h') args.help = true;
  }
  return args;
}

function absolute(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function usage(): void {
  console.error(`
Clear everything the children did, keeping the household itself.

  --dry-run     count what would go and stop, changing nothing

Kept: both children and their PINs, the chores and their schedules, the rewards,
and every value in Settings. A backup is taken first either way.
`);
}

/**
 * The photo files on disk, which are unreachable once their rows are gone.
 *
 * Recursive, because photos are filed under the day they were taken -
 * photos/YYYY/MM/DD/<uuid>.jpg (`backend/src/routes/photos.ts`) - so reading
 * only the top of the directory finds nothing and reports it as nothing to do.
 * Absolute paths, so the caller does not have to know the shape.
 */
async function photoFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await photoFiles(full)));
    else found.push(full);
  }
  return found;
}

/** The year and month folders the files leave behind, deepest first. */
async function emptyDirs(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(directory, entry.name);
    found.push(...(await emptyDirs(full)));
    found.push(full);
  }
  return found;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const pool = getPool();
  if (!pool) {
    console.error('\nDATABASE_URL is not set, so there is no household to clear.\n');
    process.exitCode = 1;
    return;
  }

  const photoDir = absolute(env.PHOTO_STORAGE_DIR);

  // Counted before anything is decided, because the number is the thing that
  // tells a person whether this is the household they think it is.
  const counts: { table: string; rows: number }[] = [];
  for (const table of ACTIVITY_TABLES) {
    const { rows } = await pool.query<{ count: string }>(`SELECT count(*)::text FROM ${table}`);
    counts.push({ table, rows: Number(rows[0]?.count ?? 0) });
  }
  const photos = await photoFiles(photoDir);
  const total = counts.reduce((sum, row) => sum + row.rows, 0);

  const { rows: children } = await pool.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM users WHERE role = 'child' ORDER BY display_name`,
  );

  console.log('\nThis would clear:\n');
  for (const { table, rows } of counts) {
    console.log(`  ${String(rows).padStart(6)}  ${table}`);
  }
  console.log(`  ${String(photos.length).padStart(6)}  photo files in ${photoDir}`);

  console.log('\nAnd keep the household: the children and their PINs, the chores and');
  console.log('their schedules, the rewards, and everything in Settings.\n');

  if (total === 0 && photos.length === 0) {
    console.log('There is nothing to clear. Nothing was changed.\n');
    return;
  }

  if (args.dryRun) {
    console.log('Nothing was changed.\n');
    return;
  }

  console.log('Backing up first...');
  // The existing backup, not a second way of doing it. If this cannot be taken
  // there is no way back, and a reset with no way back is the one version of
  // this not worth having.
  const log = { warn: () => undefined } as unknown as FastifyBaseLogger;
  const backup = await runBackup(pool, env, log, 'manual');
  console.log(`  ${backup.directory}\n`);

  console.log('This cannot be undone. The backup above is the only way back.\n');

  const rl = createInterface({ input: stdin, output: stdout });
  // Typed in full rather than y/n, for the same reason restore asks for RESTORE:
  // the prompt is worth nothing if it can be got past without reading it.
  const answer = await rl.question('Type RESET to continue, anything else to stop: ');
  rl.close();

  if (answer.trim() !== 'RESET') {
    console.log('Nothing was changed.\n');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const table of ACTIVITY_TABLES) {
      await client.query(`DELETE FROM ${table}`);
    }

    /*
     * The children become new, which is the whole reason this is a command
     * rather than nine DELETEs.
     *
     * With no chore instances left, ensureDaysMaterialized falls back to the day
     * a child was added and fills forward from there - so children created a
     * fortnight ago during testing would wake up to a fortnight of chores nobody
     * did, sitting in the parent's Needs attention. materialize.ts already
     * refuses to do that to a child added this morning; this makes them one.
     *
     * In the same transaction as the deletes, so it does not matter whether the
     * server is up or a phone asks for its day a moment later: anything
     * materialised afterwards starts from today.
     *
     * Noon UTC on the household's today, and emphatically not now(). The query
     * that reads this takes `(created_at AT TIME ZONE 'UTC')::date`, and from
     * seven in the evening in Chicago that is already tomorrow - which would put
     * the floor a day ahead of today, leave the loop with nothing to walk, and
     * give the children no chores at all until the following morning. Noon is
     * far enough from both midnights that no offset the household could adopt
     * moves the date.
     */
    await client.query(
      `UPDATE users
          SET created_at = ($1::date + time '12:00') AT TIME ZONE 'UTC'
        WHERE role = 'child'`,
      [householdToday(env.HOUSEHOLD_TZ)],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // After the commit. A photo whose row is gone is unreachable either way, so
  // losing the file is no worse than losing it late, while deleting files inside
  // the transaction would leave no way to put them back if it rolled back.
  let filesRemoved = 0;
  for (const file of photos) {
    await rm(file, { force: true }).then(
      () => {
        filesRemoved += 1;
      },
      () => undefined,
    );
  }

  // The date folders those files sat in. Deepest first, and each only if it is
  // now empty - rmdir refuses otherwise, which is the check rather than a
  // separate one. The photos directory itself stays; the server expects it.
  for (const dir of await emptyDirs(photoDir)) {
    await rm(dir, { recursive: false }).catch(() => undefined);
  }

  console.log(`\nCleared ${total} rows and ${filesRemoved} photos.`);
  if (children.length > 0) {
    const names = children.map((child) => child.display_name).join(' and ');
    console.log(`${names} start from today with nothing behind them.`);
  }
  console.log('\nIf this was a mistake, the backup taken a moment ago is the way back:\n');
  console.log(`  npm run restore -w backend -- --from "${backup.directory}"\n`);
}

main()
  .catch((error: unknown) => {
    console.error(`\nThat did not work: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
