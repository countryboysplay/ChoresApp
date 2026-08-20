import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

/**
 * Finding `pg_dump` and `pg_restore` without relying on PATH.
 *
 * On this laptop PostgreSQL is on the *user* PATH and not the machine PATH,
 * because that is where the EDB installer leaves it. Anything running as a
 * service or a scheduled task under a different account therefore starts
 * perfectly and then fails every nightly backup with "pg_dump is not
 * recognized" - a failure that only shows up as a backup that did not happen.
 *
 * So the tools are located rather than assumed: an explicit setting first, then
 * the standard install locations newest-first, then PATH as the last resort
 * because it is the one that works everywhere else.
 */

/**
 * Roots holding one directory per major version, e.g. `.../17/bin`.
 *
 * Both platforms lay PostgreSQL out this way, which the first version of this
 * file got wrong on Linux: it treated `/usr/lib/postgresql` as a flat directory,
 * found nothing there, and fell through to `/usr/bin` - where the distribution's
 * older client lives. CI caught it immediately, with a 16 client refusing the 17
 * server that CI had just installed a 17 client for.
 */
const VERSIONED_ROOTS =
  process.platform === 'win32'
    ? ['C:\\Program Files\\PostgreSQL', 'C:\\Program Files (x86)\\PostgreSQL']
    : ['/usr/lib/postgresql', '/usr/local/pgsql'];

/**
 * Checked only after the versioned roots, because these hold whatever the
 * system happened to install rather than the newest thing available - and
 * newest is the only safe choice when pg_dump refuses a newer server.
 */
const FLAT_DIRS =
  process.platform === 'win32' ? [] : ['/usr/local/pgsql/bin', '/usr/bin', '/usr/local/bin'];

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function binaryName(tool: string): string {
  return process.platform === 'win32' ? `${tool}.exe` : tool;
}

/** Version directories under a PostgreSQL root, highest version first. */
async function versionsUnder(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && /^\d+/.test(entry.name))
      .map((entry) => entry.name)
      // Newest first: pg_dump refuses a server newer than itself, so when
      // several are installed the latest is the only safe choice.
      .sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10))
      .map((name) => join(root, name, 'bin'));
  } catch {
    return [];
  }
}

/**
 * The full path to a PostgreSQL tool, or the bare name if nothing was found.
 *
 * Falling back to the bare name rather than throwing keeps the behavior a
 * household already has: on a machine where PATH is fine, this changes nothing.
 */
export async function findPgTool(tool: 'pg_dump' | 'pg_restore', explicitDir?: string): Promise<string> {
  const name = binaryName(tool);

  if (explicitDir) {
    const candidate = join(explicitDir, name);
    if (await isExecutable(candidate)) return candidate;
    // Said plainly rather than silently ignored: a wrong PG_BIN_DIR should not
    // look identical to no PG_BIN_DIR.
    throw new Error(`PG_BIN_DIR is set to ${explicitDir}, but ${name} is not there.`);
  }

  for (const root of VERSIONED_ROOTS) {
    for (const dir of await versionsUnder(root)) {
      const candidate = join(dir, name);
      if (await isExecutable(candidate)) return candidate;
    }
  }

  for (const dir of FLAT_DIRS) {
    const candidate = join(dir, name);
    if (await isExecutable(candidate)) return candidate;
  }

  return name;
}
