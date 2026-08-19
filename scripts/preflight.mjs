#!/usr/bin/env node
/**
 * Stage 0 pre-flight. Verifies the machine can actually run Chore Quest before
 * anyone waits on a confusing failure later. Safe to re-run at any time.
 */
import { execFileSync, execSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function record(name, ok, detail, fatal = true) {
  results.push({ name, ok, detail, fatal });
}

// Node >= 20.12 refuses to spawn .cmd/.bat through execFile unless a shell is
// used (the CVE-2024-27980 fix), so Windows shims like npm.cmd need shell: true.
const needsShell = (command) => process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);

function run(command, args) {
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  // Args are concatenated rather than passed separately, because Node warns
  // (DEP0190) about unescaped args when shell is true. Every call site below
  // uses fixed, literal arguments, so there is nothing to escape.
  return needsShell(command)
    ? execSync([command, ...args].join(' '), options)
    : execFileSync(command, args, options);
}

function tryCommand(name, command, args, parse) {
  try {
    const raw = run(command, args).trim();
    const { ok, detail } = parse(raw);
    record(name, ok, detail);
  } catch {
    record(name, false, 'not found on PATH');
  }
}

async function portFree(port) {
  return new Promise((resolveCheck) => {
    const server = createServer();
    server.once('error', () => resolveCheck(false));
    server.once('listening', () => server.close(() => resolveCheck(true)));
    server.listen(port, '127.0.0.1');
  });
}

const [major, minor] = process.versions.node.split('.').map(Number);
record(
  'Node.js',
  major > 20 || (major === 20 && minor >= 11),
  `v${process.versions.node} (need >= 20.11)`,
);

tryCommand('npm', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['-v'], (raw) => ({
  ok: Number(raw.split('.')[0]) >= 10,
  detail: `v${raw} (need >= 10)`,
}));

tryCommand('Git', 'git', ['--version'], (raw) => ({ ok: true, detail: raw }));

try {
  const raw = execFileSync('psql', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  record('PostgreSQL client', true, raw);
} catch {
  record('PostgreSQL client', false, 'not found - required from Stage 3 onward', false);
}

if (process.platform === 'win32') {
  tryCommand('PowerShell', 'powershell', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], (raw) => ({
    ok: true,
    detail: `v${raw}`,
  }));
}

for (const [label, port] of [['Backend port 4000', 4000], ['Frontend port 5173', 5173]]) {
  record(label, await portFree(port), (await portFree(port)) ? 'free' : 'in use', false);
}

record('backend/.env', existsSync(join(root, 'backend', '.env')), 'copy from backend/.env.example', false);
record('frontend/.env.local', existsSync(join(root, 'frontend', '.env.local')), 'copy from frontend/.env.example', false);

try {
  const tracked = execFileSync('git', ['ls-files', '--error-unmatch', 'backend/.env'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  record('No tracked secrets', !tracked.trim(), 'backend/.env is tracked by Git - remove it');
} catch {
  record('No tracked secrets', true, 'no .env files tracked');
}

const pad = Math.max(...results.map((r) => r.name.length));
console.log('\nChore Quest pre-flight\n');
for (const r of results) {
  const mark = r.ok ? 'PASS' : r.fatal ? 'FAIL' : 'WARN';
  console.log(`  [${mark}] ${r.name.padEnd(pad)}  ${r.detail}`);
}

const blockers = results.filter((r) => !r.ok && r.fatal);
console.log(
  blockers.length
    ? `\n${blockers.length} blocking issue(s). Fix these before running the app.\n`
    : '\nReady. Run "npm run dev".\n',
);
process.exit(blockers.length ? 1 : 0);
