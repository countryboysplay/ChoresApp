import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Starts Chore Quest the way the household runs it.
 *
 * `npm run build && node dist/server.js` would mostly do this, and did until
 * Stage 17. What it could not do is say why it failed. A server that exits with
 * a stack trace about a missing file is fine for whoever wrote it and useless at
 * ten at night to whoever is trying to get the kids' chores back - so everything
 * checkable is checked first, in one place, with sentences rather than errors.
 *
 * It also runs in production mode, which the plain script could not manage
 * portably: `NODE_ENV=production node ...` is not a thing cmd.exe understands.
 * That matters for real reasons rather than tidiness - it switches logging from
 * pretty-printed to JSON lines that can be tailed from a file.
 *
 * From Stage 18 it is also what Windows starts at boot, which adds the other
 * two jobs below: somewhere for the output to go, and getting the server back
 * up if it dies while nobody is watching.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(root, 'backend');

const problems = [];
const notes = [];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Reads backend/.env without pulling in dotenv, which lives in the workspace. */
async function readEnvFile() {
  const values = {};
  try {
    const raw = await readFile(join(backend, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (match) values[match[1]] = match[2].trim();
    }
  } catch {
    problems.push('backend/.env does not exist. Copy backend/.env.example to backend/.env.');
  }
  return values;
}

const env = await readEnvFile();

if (!env.DATABASE_URL) {
  problems.push('DATABASE_URL is not set in backend/.env, so there is no household to serve.');
}
if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
  problems.push(
    'SESSION_SECRET is missing or too short in backend/.env. Generate one with:\n' +
      '    node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
  );
}

// The frontend has to be built, and built for this. A dist/ built for the Pages
// preview asks the browser for /ChoresApp/assets/..., which 404s from the
// laptop and leaves a blank page with no error anybody would recognise.
const distIndex = join(root, 'frontend', 'dist', 'index.html');
if (!(await exists(distIndex))) {
  problems.push('frontend/dist is missing. Run: npm run build');
} else if ((await readFile(distIndex, 'utf8')).includes('src="/ChoresApp/')) {
  problems.push(
    'frontend/dist was built for the GitHub Pages preview, not for this laptop.\n' +
      '    Rebuild with: npm run build',
  );
}

// The service worker is emitted after Vite reports the build succeeded, so a
// build cut short at the wrong second leaves a dist that looks complete and is
// missing only this. It is a note rather than a problem because the app runs
// without it - but it is the loudest note here, because the failure it causes
// is invisible from the laptop and permanent on the phones: /sw.js falls
// through to index.html, the browser refuses to register a worker served as
// HTML, and every phone keeps running an orphaned worker from an earlier build
// that nothing can replace.
if ((await exists(distIndex)) && !(await exists(join(root, 'frontend', 'dist', 'sw.js')))) {
  notes.push(
    'frontend/dist has no sw.js, so the app cannot update itself on a phone and has\n' +
      '    no offline screen. The last build did not finish. Fix: npm run build',
  );
}


if (!(await exists(join(backend, 'dist', 'server.js')))) {
  problems.push('backend/dist is missing. Run: npm run build');
}
if (!env.FRONTEND_DIST) {
  problems.push(
    'FRONTEND_DIST is not set in backend/.env, so the backend would serve the API but no app.',
  );
}

// Everything below is a note rather than a problem: the app runs without any of
// it, just with less. The split is the same judgement made about serving http
// when a certificate has expired - a household should lose a feature, not the
// app - and saying so beats discovering it a fortnight later.
if (env.TLS_DIR) {
  const cert = join(backend, env.TLS_DIR.replace(/^\.\//, ''), 'certificate.pem');
  if (!(await exists(cert))) {
    notes.push(
      'No certificate yet, so this serves plain http and the camera and phone\n' +
        '    reminders work only on this laptop. Fix: npm run cert -- --issue',
    );
  }
} else {
  notes.push('TLS_DIR is not set, so this serves plain http and only the laptop gets the camera.');
}
if (!env.VAPID_PUBLIC_KEY) {
  notes.push('No push keys, so reminders reach the inbox but never a phone. Fix: npm run vapid');
}
if (!env.BACKUP_MIRROR_DIR) {
  notes.push(
    'BACKUP_MIRROR_DIR is unset, so backups exist only on this laptop - which does\n' +
      '    not survive the disk failing. Point it at a folder on a USB drive.',
  );
}

if (problems.length > 0) {
  console.error('\nChore Quest cannot start:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

if (notes.length > 0) {
  console.log('\nStarting, with these things switched off:\n');
  for (const note of notes) console.log(`  - ${note}`);
}

console.log(
  `\nChore Quest, production mode${env.PUBLIC_HOSTNAME ? ` on https://${env.PUBLIC_HOSTNAME}/` : ''}`,
);

/*
 * A log file, because a scheduled task's output goes nowhere at all.
 *
 * One file per day. It rotates on the day changing rather than only at startup:
 * this laptop is meant to stay up for months, and a single file covering a
 * whole season is one nobody opens. Old ones are deleted on the same fortnight
 * rule the backups use.
 */
const logDir = join(backend, 'storage', 'logs');
const KEEP_LOG_DAYS = 14;

await mkdir(logDir, { recursive: true });

/**
 * The household's date, not UTC.
 *
 * Everything else in this project dates things by the household's own clock,
 * and a log file should not be the exception: named by UTC, tonight's log would
 * roll over at 7pm local and somebody looking for "last night" would open a
 * file covering two different evenings.
 */
const timeZone = env.HOUSEHOLD_TZ || 'America/Chicago';

function today() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    // An unusable HOUSEHOLD_TZ is the server's problem to report, not this
    // script's to crash over. Naming a log badly is not worth failing to start.
    return new Date().toISOString().slice(0, 10);
  }
}

let logDay = today();
let logFile = createWriteStream(join(logDir, `chore-quest-${logDay}.log`), { flags: 'a' });

async function pruneLogs() {
  const cutoff = Date.now() - KEEP_LOG_DAYS * 24 * 60 * 60 * 1000;
  for (const name of await readdir(logDir).catch(() => [])) {
    if (!name.startsWith('chore-quest-')) continue;
    const path = join(logDir, name);
    const info = await stat(path).catch(() => null);
    if (info && info.mtimeMs < cutoff) await unlink(path).catch(() => undefined);
  }
}
await pruneLogs();

function write(text) {
  if (today() !== logDay) {
    logFile.end();
    logDay = today();
    logFile = createWriteStream(join(logDir, `chore-quest-${logDay}.log`), { flags: 'a' });
    void pruneLogs();
  }
  logFile.write(text);
  process.stdout.write(text);
}

console.log(`Logging to ${logDir}\n`);

/*
 * Restart it if it dies.
 *
 * Task Scheduler can retry a task that *fails*, but a process exiting zero is
 * not a failure by its reckoning. So this supervises instead: it restarts on any
 * exit nobody asked for, backing off so a server that cannot start does not
 * spin, and gives up once it is clear that restarting is not the answer.
 *
 * Giving up is the part worth stating. A supervisor that retries forever turns
 * a broken deploy into silence, and silence is the failure this whole stage
 * exists to prevent.
 */
const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
const GIVE_UP_AFTER = 8;
/** A server that ran this long was working; the next crash starts over. */
const HEALTHY_MS = 5 * 60 * 1000;

let stopping = false;
let failures = 0;
let child = null;

function start() {
  const startedAt = Date.now();

  child = spawn(process.execPath, [join(backend, 'dist', 'server.js')], {
    cwd: backend,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      // dotenv never overrides a variable that is already set, so this wins over
      // the NODE_ENV in backend/.env - which stays 'development' for the sake of
      // `npm run dev`, and would otherwise give the household pretty-printed
      // logs that nothing can parse.
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => write(chunk.toString()));
  }

  child.on('exit', (code, signal) => {
    if (stopping) {
      logFile.end();
      process.exit(code ?? 0);
      return;
    }

    // A server that stayed up is not part of a crash loop, however many times
    // it has restarted over the months.
    if (Date.now() - startedAt > HEALTHY_MS) failures = 0;
    failures += 1;

    write(`[serve] server exited (code ${code}, signal ${signal}) - restart ${failures}\n`);

    if (failures >= GIVE_UP_AFTER) {
      write(
        `[serve] giving up after ${failures} restarts in a row. Restarting is not going to ` +
          `fix this; the log is in ${logDir}\n`,
      );
      logFile.end();
      process.exit(1);
    }

    setTimeout(start, BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)]);
  });
}

// Ctrl+C has to reach the server rather than orphaning it. Windows leaves
// children running when the parent dies, which is how ports 4000 and 5173 ended
// up held by processes nobody could find earlier in this project.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
}

start();
