import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { cp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { promisify } from 'node:util';
import { loadEnv } from '../env.js';
import { DUMP_FILE, MANIFEST_FILE, PHOTO_DIR, type BackupManifest } from '../backup/service.js';
import { findPgTool } from '../backup/pg-tools.js';

const run = promisify(execFile);

/**
 * Puts a household back from a backup.
 *
 * Terminal only, for the same reason creating a parent is: this replaces every
 * chore, point, photo, and PIN in the household with an older copy, and there is
 * no undo. Nothing an argument, a mis-tap, or a child holding an unlocked parent
 * phone can reach should be able to do that. There is a second reason too - a
 * server cannot sensibly drop and rebuild the database it is itself connected
 * to, so this refuses to run while the API is up.
 *
 *   npm run restore -w backend -- --list
 *   npm run restore -w backend -- --from <folder>
 */

interface Args {
  from?: string;
  list?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--list') args.list = true;
    else if (flag === '--from') {
      index += 1;
      args.from = argv[index];
    }
  }
  return args;
}

function absolute(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function usage(): void {
  console.error(`
Restore the household from a backup.

  --list              show the backups on this laptop, newest first
  --from <folder>     restore from that folder

Stop the server first. This replaces everything and cannot be undone.
`);
}

/** Newest first, with what the manifest says is in each. */
async function listBackups(root: string): Promise<{ dir: string; manifest: BackupManifest | null }[]> {
  let entries: string[];
  try {
    entries = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }

  const found = [];
  for (const name of entries) {
    const dir = join(root, name);
    let manifest: BackupManifest | null = null;
    try {
      manifest = JSON.parse(await readFile(join(dir, MANIFEST_FILE), 'utf8')) as BackupManifest;
    } catch {
      // A folder with no manifest is a half-written backup or somebody else's
      // directory. Listed, so it is visible, but flagged by the null.
    }
    found.push({ dir, manifest });
  }
  return found;
}

/** True when something is already listening on the API port. */
async function serverIsRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const root = absolute(env.BACKUP_DIR);

  if (args.list) {
    const backups = await listBackups(root);
    if (backups.length === 0) {
      console.log(`No backups in ${root}`);
      return;
    }
    console.log(`Backups in ${root}, newest first:\n`);
    for (const { dir, manifest } of backups) {
      const label = manifest
        ? `${manifest.choreDate}  ${manifest.kind.padEnd(9)}  ${manifest.photoCount} photos`
        : 'no manifest - incomplete, do not restore from this';
      console.log(`  ${dir}\n      ${label}`);
    }
    return;
  }

  if (!args.from) {
    usage();
    process.exitCode = 1;
    return;
  }

  const source = absolute(args.from);
  const dump = join(source, DUMP_FILE);

  try {
    await stat(dump);
  } catch {
    console.error(`No ${DUMP_FILE} in ${source}. Use --list to see what is there.`);
    process.exitCode = 1;
    return;
  }

  let manifest: BackupManifest | null = null;
  try {
    manifest = JSON.parse(await readFile(join(source, MANIFEST_FILE), 'utf8')) as BackupManifest;
  } catch {
    console.error(
      `That folder has no ${MANIFEST_FILE}, which means the backup did not finish writing.\n` +
        'Restoring from it would produce a household missing whatever came after the failure.',
    );
    process.exitCode = 1;
    return;
  }

  if (await serverIsRunning(env.PORT)) {
    console.error(
      `Chore Quest is still running on port ${env.PORT}.\n` +
        'Stop it first (Ctrl+C in the npm run dev window), then run this again.\n' +
        'A database cannot be rebuilt underneath the server that is using it.',
    );
    process.exitCode = 1;
    return;
  }

  if (!env.DATABASE_URL) {
    console.error('No DATABASE_URL, so there is nothing to restore into.');
    process.exitCode = 1;
    return;
  }

  console.log(`
About to restore from:
  ${source}

  Taken     ${manifest.takenAt}
  Covers    ${manifest.choreDate}
  Photos    ${manifest.photoCount}
  Schema    ${manifest.migration ?? 'unknown'}

This REPLACES every chore, point, reward, photo, and PIN in the household with
the copy above. Everything that happened since then is lost. There is no undo.
`);

  const rl = createInterface({ input: stdin, output: stdout });
  // Typed in full rather than y/n. The whole point of this prompt is that it
  // cannot be got past without reading it.
  const answer = await rl.question('Type RESTORE to continue, anything else to stop: ');
  rl.close();

  if (answer.trim() !== 'RESTORE') {
    console.log('Nothing was changed.');
    return;
  }

  console.log('\nRestoring the database...');
  // --clean --if-exists drops what is there first, so this is a replacement
  // rather than a merge into whatever the database currently holds.
  const pgRestore = await findPgTool('pg_restore', env.PG_BIN_DIR);
  await run(pgRestore, [
    `--dbname=${env.DATABASE_URL}`,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    dump,
  ]);

  const photoSource = join(source, PHOTO_DIR);
  const photoTarget = absolute(env.PHOTO_STORAGE_DIR);
  try {
    await stat(photoSource);
    console.log('Restoring photos...');
    // Replaced wholesale, not merged. A photo taken after this backup belongs
    // to a chore row that no longer exists, so keeping it would leave files
    // nothing points at and a folder that no backup describes.
    await rm(photoTarget, { recursive: true, force: true });
    await cp(photoSource, photoTarget, { recursive: true });
  } catch {
    console.log('No photos in that backup; the photo folder was left alone.');
  }

  console.log(`
Done. Start the server again with: npm run dev

If a child was signed in on a phone, their session is from a database that has
just been replaced, so they will be asked for their PIN again.
`);
}

main().catch((error) => {
  console.error('\nThe restore failed:', error instanceof Error ? error.message : error);
  console.error('The household may be half-restored. Do not start the server until this is sorted.');
  process.exitCode = 1;
});
