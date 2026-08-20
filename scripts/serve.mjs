import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
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
 * pretty-printed to JSON lines the Windows host can tail to a file.
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
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
  );
}

// The frontend has to be built, and built for this. A dist/ built for the Pages
// preview asks the browser for /ChoresApp/assets/..., which 404s from the
// laptop and leaves a blank page with no error anybody would recognise.
const distIndex = join(root, 'frontend', 'dist', 'index.html');
if (!(await exists(distIndex))) {
  problems.push('frontend/dist is missing. Run: npm run build');
} else {
  const html = await readFile(distIndex, 'utf8');
  if (html.includes('src="/ChoresApp/')) {
    problems.push(
      'frontend/dist was built for the GitHub Pages preview, not for this laptop.\n' +
        '  Rebuild with: npm run build',
    );
  }
}

if (!(await exists(join(backend, 'dist', 'server.js')))) {
  problems.push('backend/dist is missing. Run: npm run build');
}

if (!env.FRONTEND_DIST) {
  problems.push(
    'FRONTEND_DIST is not set in backend/.env, so the backend will serve the API but no app.',
  );
}

// Everything below is a note rather than a problem: the app runs without any of
// it, just with less. Saying so beats a household discovering it later.
if (env.TLS_DIR) {
  const cert = join(backend, env.TLS_DIR.replace(/^\.\//, ''), 'certificate.pem');
  if (!(await exists(cert))) {
    notes.push(
      'No certificate yet, so this will serve plain http. The camera and phone\n' +
        '  reminders will only work on this laptop. Fix with: npm run cert -- --issue',
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
      '  not survive the disk failing. Point it at a folder on a USB drive.',
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
  `\nChore Quest, production mode${env.PUBLIC_HOSTNAME ? ` on https://${env.PUBLIC_HOSTNAME}/` : ''}\n`,
);

const child = spawn(process.execPath, [join(backend, 'dist', 'server.js')], {
  cwd: backend,
  stdio: 'inherit',
  env: {
    ...process.env,
    // dotenv never overrides a variable that is already set, so this wins over
    // the NODE_ENV in backend/.env - which stays 'development' for the sake of
    // `npm run dev`, and would otherwise give the household pretty-printed logs
    // nothing can parse.
    NODE_ENV: 'production',
  },
});

// Ctrl+C has to reach the server rather than orphaning it. Windows leaves
// children running when the parent dies, which is how ports end up held by
// something nobody can find.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 0));
