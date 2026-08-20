import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * The laptop dashboard: starting, stopping, backing up, and adding a parent.
 *
 * Three rules shape this.
 *
 * IT DOES NOT DEPEND ON THE APP. A tool for servicing the server is needed
 * precisely when the server is unwell, so this is its own process with no build
 * step, no framework, and no import of anything the app compiles. It reads
 * backend/.env directly and shells out to the same commands a person would. If
 * Chore Quest will not start, this still opens and still says why.
 *
 * IT IS LOOPBACK ONLY, AND CLOSED TO OTHER PAGES. It can create a parent account
 * and stop the household's server, so it binds 127.0.0.1 and nothing else. What
 * has to be kept out is not the person at the laptop - they could run every one
 * of these commands from a terminal anyway - it is the browser they have open:
 * without a guard, any website they visit could quietly POST to localhost and
 * add itself a parent account.
 *
 * The guard is two-part, so that the address can be a permanent bookmark. Every
 * action carries a token minted at launch and delivered inside the page, never
 * in the link. The page itself is served without one, but only to a navigation
 * the browser labels as unattributed or our own - see isOwnNavigation - which a
 * page on another site cannot forge.
 *
 * IT DOES NOT DO THE IRREVERSIBLE ONE. Restoring a backup replaces every chore,
 * point, and photo with an older copy, and that decision has always been a
 * terminal command on purpose. A button is exactly what it should not have.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const backend = join(root, 'backend');

const PORT = 4100;
const TOKEN = randomBytes(24).toString('base64url');
const TASK = 'Chore Quest';

/* ---------- reading the household's configuration ---------- */

async function readEnvFile() {
  const values = {};
  try {
    const raw = await readFile(join(backend, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (match) values[match[1]] = match[2].trim();
    }
  } catch {
    // Reported by the status endpoint rather than thrown: a missing .env is
    // one of the things somebody would open this dashboard to find out about.
  }
  return values;
}

const env = await readEnvFile();

/* ---------- shelling out ---------- */

async function powershell(command) {
  const { stdout } = await run(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout.trim();
}

async function psJson(command) {
  const out = await powershell(`${command} | ConvertTo-Json -Compress -Depth 4`);
  if (!out) return null;
  const parsed = JSON.parse(out);
  return parsed;
}

/* ---------- what the dashboard reports ---------- */

async function taskState() {
  try {
    const state = await powershell(
      `(Get-ScheduledTask -TaskName '${TASK}' -ErrorAction Stop).State`,
    );
    return { registered: true, state };
  } catch {
    return { registered: false, state: 'Not registered' };
  }
}

async function serverHealth() {
  const host = env.PUBLIC_HOSTNAME ? `https://${env.PUBLIC_HOSTNAME}` : `http://127.0.0.1:${env.PORT || 4000}`;
  try {
    const response = await fetch(`${host}/api/health`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { reachable: false };
    return { reachable: true, ...(await response.json()) };
  } catch {
    return { reachable: false };
  }
}

/** Removable drives, for the "also copy the backup here" choice. */
async function removableDrives() {
  try {
    const raw = await psJson(
      "Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } | " +
        'Select-Object DriveLetter, FileSystemLabel, SizeRemaining',
    );
    if (!raw) return [];
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map((drive) => ({
      letter: drive.DriveLetter,
      label: drive.FileSystemLabel || 'Removable drive',
      freeGb: Math.round((drive.SizeRemaining / 1024 ** 3) * 10) / 10,
    }));
  } catch {
    return [];
  }
}

async function certificate() {
  if (!env.TLS_DIR) return { present: false, reason: 'TLS_DIR is not set' };
  const path = join(backend, env.TLS_DIR.replace(/^\.\//, ''), 'certificate.pem');
  try {
    const { X509Certificate } = await import('node:crypto');
    const parsed = new X509Certificate(await readFile(path, 'utf8'));
    const expires = new Date(parsed.validTo);
    return {
      present: true,
      hostname: parsed.subjectAltName?.replace(/^DNS:/, '') ?? null,
      expiresAt: expires.toISOString(),
      daysRemaining: Math.floor((expires.getTime() - Date.now()) / 86_400_000),
    };
  } catch {
    return { present: false, reason: 'no certificate on disk' };
  }
}

/** The backups on disk, newest first, read from their manifests. */
async function backups() {
  const dir = env.BACKUP_DIR
    ? join(backend, env.BACKUP_DIR.replace(/^\.\//, ''))
    : join(backend, 'storage', 'backups');
  try {
    const names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .slice(0, 8);

    const found = [];
    for (const name of names) {
      let manifest = null;
      try {
        manifest = JSON.parse(await readFile(join(dir, name, 'manifest.json'), 'utf8'));
      } catch {
        // A folder with no manifest is an unfinished backup. Shown, flagged.
      }
      found.push({ name, folder: join(dir, name), manifest });
    }
    return { dir, found };
  } catch {
    return { dir, found: [] };
  }
}

async function recentLog(lines = 60) {
  const dir = join(backend, 'storage', 'logs');
  try {
    const names = (await readdir(dir)).filter((n) => n.startsWith('chore-quest-')).sort();
    const newest = names[names.length - 1];
    if (!newest) return { file: null, lines: [] };
    const raw = await readFile(join(dir, newest), 'utf8');
    const all = raw.split(/\r?\n/).filter(Boolean);
    return {
      file: newest,
      lines: all.slice(-lines).map((line) => {
        // Production logs are JSON; show the human part and keep the rest out
        // of the way. Anything that is not JSON is printed as it was.
        try {
          const entry = JSON.parse(line);
          const when = entry.time ? new Date(entry.time).toLocaleTimeString() : '';
          const level = { 30: 'info', 40: 'WARN', 50: 'ERROR', 60: 'FATAL' }[entry.level] ?? entry.level;
          return `${when}  ${level}  ${entry.msg ?? ''}${entry.err ? ` - ${entry.err.message}` : ''}`;
        } catch {
          return line;
        }
      }),
    };
  } catch {
    return { file: null, lines: [] };
  }
}

async function household() {
  if (!env.DATABASE_URL) return { available: false, reason: 'DATABASE_URL is not set' };
  try {
    const { default: pg } = await import('pg');
    const db = new pg.Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 4000 });
    const { rows } = await db.query(
      `SELECT id, role, display_name, is_active, (pin_hash IS NOT NULL) AS has_pin
         FROM users ORDER BY role DESC, sort_order, display_name`,
    );
    await db.end();
    return { available: true, members: rows };
  } catch (error) {
    return { available: false, reason: error.message };
  }
}

/* ---------- actions ---------- */

/**
 * Adds a parent, or sets somebody's PIN.
 *
 * Uses the app's own hashing rather than a copy, so a PIN made here is
 * indistinguishable from one made by the CLI. That means the backend has to be
 * built; if it is not, this says so instead of writing a hash the app would
 * reject.
 */
async function withBackend(modulePath) {
  try {
    return await import(`file://${join(backend, 'dist', modulePath)}`);
  } catch {
    throw new Error('The backend is not built. Press "Rebuild and restart", or run npm run build.');
  }
}

async function addParent(name, pin) {
  const { hashPin, isValidPinFormat, isTooCommon } = await withBackend('auth/pin.js');
  if (!name?.trim()) throw new Error('A parent needs a name.');
  if (!isValidPinFormat(pin)) throw new Error('A PIN is four digits.');
  if (isTooCommon(pin)) throw new Error('That is one of the first PINs anyone guesses. Pick another.');

  const { default: pg } = await import('pg');
  const db = new pg.Pool({ connectionString: env.DATABASE_URL });
  try {
    const existing = await db.query('SELECT 1 FROM users WHERE display_name = $1', [name.trim()]);
    if (existing.rowCount) throw new Error(`"${name.trim()}" already exists.`);
    await db.query(
      `INSERT INTO users (role, display_name, pin_hash, pin_set_at)
       VALUES ('parent', $1, $2, now())`,
      [name.trim(), await hashPin(pin)],
    );
    return { added: name.trim() };
  } finally {
    await db.end();
  }
}

async function setPin(userId, pin) {
  const { hashPin, isValidPinFormat, isTooCommon } = await withBackend('auth/pin.js');
  if (!isValidPinFormat(pin)) throw new Error('A PIN is four digits.');
  if (isTooCommon(pin)) throw new Error('That is one of the first PINs anyone guesses. Pick another.');

  const { default: pg } = await import('pg');
  const db = new pg.Pool({ connectionString: env.DATABASE_URL });
  try {
    const { rowCount } = await db.query(
      `UPDATE users SET pin_hash = $2, pin_set_at = now(),
                        failed_pin_attempts = 0, pin_locked_until = NULL
        WHERE id = $1`,
      [userId, await hashPin(pin)],
    );
    if (!rowCount) throw new Error('No such person.');
    // Every device that person is on has to sign in again - the same rule the
    // app applies, and the reason a PIN reset is worth doing after a lost phone.
    await db.query(
      `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    await db.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
    return { ok: true };
  } finally {
    await db.end();
  }
}

/**
 * Takes a backup now, optionally copying it to a plugged-in drive.
 *
 * The drive is passed through as BACKUP_MIRROR_DIR for this one run rather than
 * written to .env, so choosing a drive here is a one-off and does not quietly
 * reconfigure the nightly job.
 */
async function backupNow(driveLetter) {
  const { runBackup } = await withBackend('backup/service.js');
  const { loadEnv } = await withBackend('env.js');

  // The values parsed from backend/.env, not just process.env. The app's own
  // loader reads .env relative to the working directory, and this dashboard
  // runs from the repository root - so left to itself it finds nothing and
  // reports that a household with a perfectly good database has no
  // DATABASE_URL, which is what happened the first time this ran.
  const overrides = { ...process.env, ...env };

  // And the paths inside it are relative to backend/, because that is where the
  // server runs from. Without this the dashboard wrote its backups beside the
  // repository instead of into backend/storage, and - far worse - found no
  // photos to include, producing a backup that looked fine and was missing half
  // of what a backup is for.
  for (const key of ['BACKUP_DIR', 'PHOTO_STORAGE_DIR']) {
    if (overrides[key] && !isAbsolute(overrides[key])) {
      overrides[key] = resolve(backend, overrides[key]);
    }
  }

  if (driveLetter) overrides.BACKUP_MIRROR_DIR = `${driveLetter}:\\ChoreQuestBackups`;

  const loaded = loadEnv(overrides);
  const { default: pg } = await import('pg');
  const db = new pg.Pool({ connectionString: loaded.DATABASE_URL });
  const quiet = { info: () => {}, warn: () => {}, error: () => {} };

  try {
    if (driveLetter) {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(overrides.BACKUP_MIRROR_DIR, { recursive: true });
    }
    const result = await runBackup(db, loaded, quiet, 'manual');
    return {
      folder: result.directory,
      megabytes: Math.round((result.bytes / 1024 / 1024) * 100) / 100,
      photos: result.photoCount,
      copiedTo: result.mirroredTo,
    };
  } finally {
    await db.end();
  }
}

/* ---------- the http surface ---------- */

const routes = {
  'GET /api/status': async () => ({
    task: await taskState(),
    health: await serverHealth(),
    certificate: await certificate(),
    backups: await backups(),
    drives: await removableDrives(),
    household: await household(),
    config: {
      hostname: env.PUBLIC_HOSTNAME ?? null,
      mirror: env.BACKUP_MIRROR_DIR || null,
      pushConfigured: Boolean(env.VAPID_PUBLIC_KEY),
      cashOutHint: 'Set the rate and minimum in the app under Settings.',
    },
  }),

  'GET /api/logs': async () => recentLog(80),

  'POST /api/task/start': async () => {
    await powershell(`Start-ScheduledTask -TaskName '${TASK}'`);
    return { ok: true };
  },
  'POST /api/task/stop': async () => {
    await powershell(`Stop-ScheduledTask -TaskName '${TASK}'`);
    return { ok: true };
  },
  'POST /api/task/restart': async () => {
    await powershell(
      `Stop-ScheduledTask -TaskName '${TASK}'; Start-Sleep -Seconds 3; Start-ScheduledTask -TaskName '${TASK}'`,
    );
    return { ok: true };
  },

  'POST /api/backup': async (body) => backupNow(body.drive || null),
  'POST /api/parent': async (body) => addParent(body.name, body.pin),
  'POST /api/pin': async (body) => setPin(body.userId, body.pin),

  'POST /api/cert/renew': async () => {
    // The CLI rather than the module: it already prints the reasons a renewal
    // fails, and those reasons are most of the value.
    const { stdout, stderr } = await run('npm', ['run', 'cert', '--', '--issue'], {
      cwd: root,
      shell: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { output: `${stdout}\n${stderr}`.trim() };
  },

  'POST /api/rebuild': async () => {
    const { stdout, stderr } = await run('npm', ['run', 'build'], {
      cwd: root,
      shell: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    await powershell(
      `Stop-ScheduledTask -TaskName '${TASK}'; Start-Sleep -Seconds 3; Start-ScheduledTask -TaskName '${TASK}'`,
    );
    return { output: `${stdout}\n${stderr}`.trim().split('\n').slice(-12).join('\n') };
  },
};

function unauthorised(response, message) {
  response.writeHead(403, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: message ?? 'That request did not come from this dashboard.' }));
}

/**
 * Whether this is the browser opening the dashboard itself - a bookmark, the
 * address bar, the launch below, or a reload of the page - rather than a
 * request set off by a page on some other site.
 *
 * Sec-Fetch-Site is filled in by the browser and is unreachable from script, so
 * a page on another site that links to, opens, or fetches this address is
 * labelled 'cross-site' and turned away, while a bookmark arrives as 'none' and
 * the dashboard's own reload as 'same-origin'. That is what lets the link be
 * permanent: the token no longer has to ride in the URL to keep pages out.
 *
 * A browser too old to send these headers gets no exemption and falls back to
 * the token, which is still printed at launch.
 */
function isOwnNavigation(request) {
  const { 'sec-fetch-site': site, 'sec-fetch-mode': mode, 'sec-fetch-dest': dest } = request.headers;
  return (site === 'none' || site === 'same-origin') && mode === 'navigate' && dest === 'document';
}

const server = createServer(async (request, response) => {
  // Loopback only, and only under a loopback name. Together with the token this
  // is what stops a page in the browser reaching in.
  const host = (request.headers.host ?? '').split(':')[0];
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return unauthorised(response);

  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const isPage = request.method === 'GET' && url.pathname === '/';
  const token = url.searchParams.get('token') ?? request.headers['x-admin-token'];

  if (token !== TOKEN && !(isPage && isOwnNavigation(request))) {
    // A token that is present but wrong is almost always a tab left open across
    // a restart. The page is fine; its token belongs to the previous launch.
    return unauthorised(
      response,
      token ? 'This page is from an earlier run of the dashboard. Reload it to carry on.' : undefined,
    );
  }

  if (isPage) {
    const page = await readFile(join(here, 'page.html'), 'utf8');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page.replace('__TOKEN__', TOKEN));
    return;
  }

  const key = `${request.method} ${url.pathname}`;
  const handler = routes[key];
  if (!handler) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'No such action.' }));
    return;
  }

  let body = {};
  if (request.method === 'POST') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'That request was not valid.' }));
        return;
      }
    }
  }

  try {
    const result = await handler(body);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result));
  } catch (error) {
    // The message is the point. Everything here is a local operation whose
    // failure is something the person reading it can usually act on.
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: error.message ?? String(error) }));
  }
});

server.on('error', (error) => {
  // A dashboard whose whole job is explaining things must not itself exit with
  // a stack trace. Already-running is the common case and has an easy answer.
  if (error.code === 'EADDRINUSE') {
    console.error(`
The dashboard is already running on port ${PORT}.

Open it at http://127.0.0.1:${PORT}/ - this second copy is not needed.

If it does not answer there, close the leftover process and start this again:
  Get-NetTCPConnection -LocalPort ${PORT} -State Listen |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
`);
    process.exit(1);
  }
  console.error(`
The dashboard could not start: ${error.message}
`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${PORT}/`;
  console.log(`\nChore Quest laptop dashboard\n\n  ${link}\n`);
  console.log('Loopback only, and the same address every launch - worth a bookmark.');
  console.log('Ctrl+C to stop the dashboard. It does not stop Chore Quest itself.\n');

  // Opening it is the whole point of a dashboard; failing to is not worth an
  // error, since the address is right there.
  run('powershell', ['-NoProfile', '-Command', `Start-Process '${link}'`], {
    windowsHide: true,
  }).catch(() => undefined);
});
