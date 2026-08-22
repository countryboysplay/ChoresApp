#!/usr/bin/env node
/**
 * Builds the app without taking it off the air.
 *
 * `vite build` empties its output directory before it writes anything, and the
 * backend serves that exact directory from disk on every request. So a plain
 * rebuild is an outage: for the length of the build the household's app is a
 * folder with nothing in it, and a phone that opens it in that window gets a
 * shell whose assets 404. Rebuilding therefore meant waiting for a moment when
 * nobody was mid-chore, which is the opposite of what a one-click button in the
 * dashboard is for.
 *
 * So this builds beside the live copy and then moves the new files in over the
 * top, rather than replacing the directory.
 *
 * The directory is deliberately never renamed. That was the first attempt, and
 * on Windows it does not hold: a directory cannot be renamed while any process
 * has a file open inside it, and a server answering requests is exactly such a
 * process. Under load it failed every time - with the live copy already renamed
 * away, which is the one outcome worse than the outage it was meant to prevent.
 *
 * Copying in place is safe here for a reason worth stating: every asset Vite
 * emits carries a content hash in its name, so a new build never overwrites a
 * file an already-loaded page might still ask for. It adds its files alongside.
 * The handful of names that are fixed - index.html, sw.js, the manifest, the
 * icons - are each overwritten by a single file write, and index.html is
 * written last, so at no point does the directory hold a shell pointing at
 * assets that are not there yet.
 *
 * Everything that builds the app comes through here, including
 * `npm run build -w frontend`, which is the natural thing for a person to type
 * and used to be a plain `vite build` straight into the directory being served.
 * A foot-gun with a sensible name is still a foot-gun.
 *
 * It is also the honest place to check that the build produced a service
 * worker. vite-plugin-pwa emits sw.js in a second pass that runs *after* Vite
 * prints that the build succeeded, so a run cut short at the wrong second
 * leaves a dist that looks complete and is missing only that - and a dist
 * missing sw.js strands every phone on an orphaned worker it cannot replace.
 * Checking here means a bad build is never moved in at all.
 */
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = join(root, 'frontend');

const live = join(frontend, 'dist');
const next = join(frontend, 'dist.next');

/** The one file whose name is fixed and whose contents name every other file. */
const LAST = 'index.html';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Every file under `dir`, as paths relative to it, with forward slashes. */
async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}

/** Runs a command in frontend/, inheriting stdio so the build output is the build output. */
function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: frontend,
      stdio: 'inherit',
      // npx is a batch file on Windows and is not executable directly.
      shell: process.platform === 'win32',
    });
    child.on('error', rejectRun);
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

function fail(message) {
  console.error(`\nThe app was not rebuilt:\n\n  - ${message}\n`);
  console.error('  The copy the household is being served is untouched.\n');
  process.exit(1);
}

/*
 * Windows will refuse to overwrite a file another process is reading. The
 * server opens and closes per request, so a clash is brief by definition and
 * waiting is the whole remedy.
 */
async function copyWithRetry(from, to) {
  const backoff = [0, 50, 150, 400, 1000];
  for (let attempt = 0; attempt < backoff.length; attempt += 1) {
    if (backoff[attempt] > 0) await new Promise((r) => setTimeout(r, backoff[attempt]));
    try {
      await copyFile(from, to);
      return;
    } catch (error) {
      const retriable = ['EPERM', 'EBUSY', 'EACCES'].includes(error.code);
      if (!retriable || attempt === backoff.length - 1) throw error;
    }
  }
}

// A previous run that died mid-build leaves this behind, and building on top of
// one would ship whatever it contained.
await rm(next, { recursive: true, force: true });

await run('npx', ['tsc', '--noEmit']);
await run('npx', ['vite', 'build', '--outDir', 'dist.next', '--emptyOutDir']);

if (!(await exists(join(next, LAST)))) fail('the build produced no index.html.');

if (!(await exists(join(next, 'sw.js')))) {
  fail(
    'the build produced no sw.js, so phones would never see this change.\n' +
      '    vite-plugin-pwa emits it after Vite reports success, so the build was cut short.',
  );
}

// The same check serve.mjs makes, made early enough to be worth something. A
// dist built for the Pages preview asks the browser for /ChoresApp/assets/...,
// which 404s from the laptop and leaves a blank page nobody can diagnose.
if (!process.env.VITE_BASE_PATH) {
  const index = await readFile(join(next, LAST), 'utf8');
  if (index.includes('src="/ChoresApp/')) {
    fail("the build came out with the GitHub Pages base path, not this laptop's.");
  }
}

const built = await walk(next);
await mkdir(live, { recursive: true });

try {
  // Everything except index.html first, so the shell is never the first thing
  // to change. Assets are content-hashed, so these are almost all new names
  // arriving beside the old ones rather than overwriting anything in use.
  for (const file of built) {
    if (file === LAST) continue;
    const target = join(live, file);
    await mkdir(dirname(target), { recursive: true });
    await copyWithRetry(join(next, file), target);
  }
  // And now the one file that names all of them.
  await copyWithRetry(join(next, LAST), join(live, LAST));
} catch (error) {
  fail(
    `the new files could not be moved in (${error.code ?? error.message}).\n` +
      '    The app is still serving, but it is now a mix of two builds. Run this again.',
  );
}

/*
 * Sweep the previous build's hashed assets.
 *
 * After index.html is in place nothing being served refers to these, so
 * removing them frees the disk without a window where something needs one. A
 * phone that loaded the old shell in the last few seconds is the exception, and
 * it is already covered: those files are in its service worker's precache.
 */
const stale = (await walk(live)).filter((file) => !built.includes(file));
for (const file of stale) await rm(join(live, file), { force: true }).catch(() => undefined);

await rm(next, { recursive: true, force: true }).catch(() => undefined);

const size = (await Promise.all(built.map((f) => stat(join(live, f)).then((s) => s.size, () => 0))))
  .reduce((a, b) => a + b, 0);

console.log(
  `\nThe app is rebuilt and already live - ${built.length} files, ` +
    `${(size / 1024 / 1024).toFixed(1)} MB, ${stale.length} from the previous build removed.` +
    '\nThe server did not need restarting.\n',
);
