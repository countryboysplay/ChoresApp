import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect as netConnect } from 'node:net';
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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

/*
 * The passcode, and what it changes.
 *
 * Without one this stays exactly what it was: loopback only, guarded by the
 * token and Sec-Fetch-Site, on the reasoning that whoever is sitting at this
 * laptop could run every one of these commands from a terminal anyway.
 *
 * Set one and the dashboard becomes reachable under a tailnet name as well,
 * which changes who "whoever" is - a phone on the sofa, and every other device
 * on the tailnet. So the passcode is then required for everything, including
 * from the laptop itself. Exempting loopback would have been kinder to type,
 * but Tailscale Serve forwards to 127.0.0.1 too: from inside this process a
 * request from the tailnet and a request from the machine are the same
 * connection, and the only thing separating them is a header a client can
 * write. A rule that cannot be verified is not a rule.
 *
 * It reads from backend/.env like everything else here, and deliberately not
 * from a parent PIN in the database: this is the tool for when the household's
 * server is unwell, and a login that needs Postgres is a login that is gone
 * exactly when it is wanted.
 */
// process.env first so it can be tried once without editing backend/.env.
const PASSCODE = process.env.ADMIN_PASSCODE ?? env.ADMIN_PASSCODE ?? '';
const SESSION_COOKIE = 'cq_admin';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/** Live sign-ins. In memory on purpose: restarting the dashboard signs them out. */
const sessions = new Map();

let failures = 0;
let lockedUntil = 0;

function cookiesOf(request) {
  const out = {};
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

function signedIn(request) {
  const token = cookiesOf(request)[SESSION_COOKIE];
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires) return false;
  if (expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/** Compared as digests so the comparison is a fixed length and a fixed time. */
function passcodeMatches(supplied) {
  if (!PASSCODE) return false;
  const a = createHash('sha256').update(String(supplied)).digest();
  const b = createHash('sha256').update(PASSCODE).digest();
  return timingSafeEqual(a, b);
}

/*
 * Loopback names always. A tailnet name only once a passcode exists, so the
 * dashboard cannot be reachable from another machine and unguarded at the same
 * time. The name is still checked rather than trusted: it is what stops a DNS
 * record somebody else controls from resolving here and being treated as ours.
 */
function hostAllowed(host) {
  if (['127.0.0.1', 'localhost', '[::1]'].includes(host)) return true;
  return PASSCODE !== '' && host.endsWith('.ts.net');
}

function loginPage(message) {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chore Quest laptop</title>
<style>
  body { margin:0; min-height:100dvh; display:grid; place-items:center; padding:24px;
         background:#0e1838; color:#e4ebff; font-family:system-ui,-apple-system,sans-serif; }
  form { width:min(360px,100%); display:grid; gap:14px; text-align:center; }
  h1 { margin:0; font-size:1.4rem; color:#fff; }
  p { margin:0; color:#9fb3e0; font-size:.95rem; }
  input, button { font:inherit; min-height:48px; border-radius:12px; border:2px solid #2f4479; padding:0 14px; }
  input { background:#060c22; color:#fff; text-align:center; }
  button { border:none; background:#4d7cfe; color:#fff; font-weight:700; }
  .bad { color:#ff8b8b; }
</style>
<form method="post" action="/api/login">
  <h1>Chore Quest laptop</h1>
  <p>This can stop the server and reset a PIN, so it asks first.</p>
  <input type="password" name="passcode" autocomplete="current-password"
         placeholder="Passcode" autofocus required>
  <button type="submit">Sign in</button>
  <p class="bad">${message ?? ''}</p>
</form>
</html>`;
}

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

/**
 * Stop the server and start it again, waiting on the thing that matters.
 *
 * The old shape was `Stop; Start-Sleep 3; Start`, and three seconds was a guess
 * in both directions. Too long, because the port is usually free in well under
 * one; too short, because nothing checked - so a start issued while the old
 * process still held 443 would fail, the task would report success, and the
 * household would be told the server had restarted when it had not come back.
 *
 * A restart is the one thing here that genuinely takes the app off the air, so
 * it waits for the port to actually free, starts, waits for it to answer again,
 * and reports how long that took - and never reports success on a server that
 * has not answered. Saying "back after 6s" is worth more than
 * saying "restarted", because the number is the thing somebody wants to know
 * before doing it again at bedtime.
 */
async function restartTask() {
  const started = Date.now();
  await powershell(`Stop-ScheduledTask -TaskName '${TASK}'`);

  /*
   * If it will not let go, start it anyway rather than leaving it stopped.
   *
   * The task is already stopped by the line above, so there is no version of
   * this that changes nothing - and an earlier draft said "Nothing was changed"
   * here, which was worse than useless: it would have left the household's app
   * down while telling whoever read it that it was still up. A start that fails
   * because the port is held is recoverable and visible; a server nobody knows
   * is stopped is neither.
   */
  const free = await waitFor(async () => !(await portIsBusy()), 15_000);
  await powershell(`Start-ScheduledTask -TaskName '${TASK}'`);

  const back = await waitFor(portIsBusy, 60_000);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (back) return { restarted: true, seconds };

  return {
    restarted: false,
    seconds,
    warning: free
      ? 'It was stopped and started, but nothing is answering. Check the log below.'
      : 'It would not let go of its port, so the restart was issued on top of it ' +
        'and nothing is answering. The server is stopped. Check the log below.',
  };
}

/** Whether anything holds a given port on this machine. */
function listening(port) {
  return new Promise((resolve) => {
    const socket = netConnect({ host: '127.0.0.1', port });
    const answer = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => answer(true));
    socket.once('timeout', () => answer(false));
    socket.once('error', () => answer(false));
  });
}

/**
 * Whether the household's server is holding either of the ports it might use.
 *
 * Both, and not the one TLS_DIR implies. The backend chooses by whether a
 * certificate actually loaded - `certificate ? HTTPS_PORT : PORT` in
 * server.ts - and TLS_DIR set with no certificate yet is a supported state that
 * serve.mjs reports as a note rather than a problem. Guessing from TLS_DIR gets
 * that case exactly backwards: it would watch 443 while the app served 4000, so
 * the wait for the port to free would pass instantly and the wait for it to come
 * back could never pass at all - a full minute of stall and then a false alarm
 * about a restart that worked.
 *
 * This is the same answer restore.ts settled on for the same question.
 */
async function portIsBusy() {
  return (await listening(Number(env.PORT || 4000))) ||
    (await listening(Number(env.HTTPS_PORT || 443)));
}

/** Polls until the check passes or the deadline runs out. */
async function waitFor(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

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
    return restartTask();
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

  /*
   * The app only, and without a restart.
   *
   * The backend reads frontend/dist off disk on every request, so a rebuilt app
   * is live the moment the files land - stopping the server to publish a
   * stylesheet only ever bought an outage. This skips the backend's tsc too,
   * which nothing in a frontend change can have invalidated. Seconds instead of
   * the better part of a minute, and nobody is signed out.
   *
   * Use the one below instead when backend code changed, which includes any
   * git pull that touched more than the app.
   */
  'POST /api/rebuild/app': async () => {
    const { stdout, stderr } = await run('npm', ['run', 'build:frontend'], {
      cwd: root,
      shell: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    // The service worker is emitted after Vite says the build succeeded, so its
    // absence is the signature of a build that was cut short - and a dist
    // without one leaves every phone on an orphaned worker it cannot replace.
    if (!existsSync(join(root, 'frontend', 'dist', 'sw.js'))) {
      throw new Error(
        'The build finished without emitting frontend/dist/sw.js, so phones would never ' +
          'see this change. Run npm run build:frontend on the laptop and read the output.',
      );
    }
    return { output: `${stdout}\n${stderr}`.trim().split('\n').slice(-12).join('\n') };
  },

  'POST /api/rebuild': async () => {
    const { stdout, stderr } = await run('npm', ['run', 'build'], {
      cwd: root,
      shell: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    const restart = await restartTask();
    return {
      ...restart,
      output: `${stdout}\n${stderr}`.trim().split('\n').slice(-12).join('\n'),
    };
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

/** Reads a request body as text, for the one route that needs it before routing. */
async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

const server = createServer(async (request, response) => {
  // Only under a name we recognise. Together with the token this is what stops
  // a page in the browser reaching in.
  const host = (request.headers.host ?? '').split(':')[0];
  if (!hostAllowed(host)) return unauthorised(response);

  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const isPage = request.method === 'GET' && url.pathname === '/';
  const token = url.searchParams.get('token') ?? request.headers['x-admin-token'];

  if (PASSCODE && !signedIn(request)) {
    if (request.method === 'POST' && url.pathname === '/api/login') {
      // Slow down after a run of wrong answers. The passcode is something a
      // person types on a phone, so it is short enough to be worth guessing.
      if (Date.now() < lockedUntil) {
        response.writeHead(429, { 'content-type': 'text/html; charset=utf-8' });
        response.end(loginPage('Too many tries. Wait a minute and try again.'));
        return;
      }

      const raw = await readBody(request);
      const supplied = new URLSearchParams(raw).get('passcode') ?? '';
      if (!passcodeMatches(supplied)) {
        failures += 1;
        if (failures >= 5) {
          lockedUntil = Date.now() + 60_000;
          failures = 0;
        }
        response.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
        response.end(loginPage('That passcode is not right.'));
        return;
      }

      failures = 0;
      const session = randomBytes(24).toString('base64url');
      sessions.set(session, Date.now() + SESSION_MS);
      // Secure only when it arrived over https, which over Tailscale Serve it
      // did; setting it unconditionally would stop the cookie sticking on the
      // laptop's own http address.
      const secure = request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      response.writeHead(303, {
        location: '/',
        'set-cookie':
          `${SESSION_COOKIE}=${session}; HttpOnly; SameSite=Lax; Path=/; ` +
          `Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}`,
      });
      response.end();
      return;
    }

    if (isPage) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(loginPage());
      return;
    }

    return unauthorised(response, 'Sign in to the dashboard first, then try again.');
  }

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
    const raw = await readBody(request);
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
  console.log('The same address every launch - worth a bookmark.\n');

  if (PASSCODE) {
    console.log(
      'ADMIN_PASSCODE is set, so this asks for it once per browser, and it can be\n' +
        'reached over Tailscale. To publish it to your tailnet, in another window:\n\n' +
        '    tailscale serve --bg ' + PORT + '\n\n' +
        'then open the https address it prints, on the phone. tailscale serve --off\n' +
        'takes it down again. Nothing outside the tailnet can reach it either way.\n',
    );
  } else {
    console.log(
      'Loopback only. Set ADMIN_PASSCODE in backend/.env to be asked for a passcode\n' +
        'and to allow reaching this from a phone over Tailscale.\n',
    );
  }

  console.log('Ctrl+C to stop the dashboard. It does not stop Chore Quest itself.\n');

  // Opening it is the whole point of a dashboard; failing to is not worth an
  // error, since the address is right there.
  run('powershell', ['-NoProfile', '-Command', `Start-Process '${link}'`], {
    windowsHide: true,
  }).catch(() => undefined);
});
