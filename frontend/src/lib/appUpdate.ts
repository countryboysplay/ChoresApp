/**
 * Whether a new version has installed and is waiting to take over.
 *
 * Its own module, deliberately. The registration in serviceWorker.ts imports
 * `virtual:pwa-register`, which only exists once Vite has built it - so a screen
 * that imported the store from there would drag a build-time virtual module
 * into every test that renders the app. The store is plain state and belongs
 * apart from the thing that fills it in.
 *
 * A store rather than a prompt: no dialog for anybody. An update waiting at
 * launch is installed automatically (below); one that arrives mid-use is shown
 * only on the parent System status screen, which can install it immediately.
 */
let updateWaiting = false;
let takeOver: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

export function subscribeToUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isUpdateWaiting(): boolean {
  return updateWaiting;
}

/*
 * "Next launch", made literal (owner decision 2026-11-10). An update found while
 * the app is launching installs at once; one that lands mid-use still waits, so
 * nobody is reloaded out of a half-finished checklist. iOS suspends home-screen
 * apps instead of closing them, so coming back after a real absence counts as a
 * launch too - otherwise the old build would never leave a phone.
 */
const LAUNCH_WINDOW_MS = 10_000;
const AWAY_COUNTS_AS_RELAUNCH_MS = 5 * 60_000;
let launchedAt = Date.now();
let hiddenAt: number | null = null;

/** Records the app being hidden or shown; true when this showing counts as a launch. */
export function noteVisibility(hidden: boolean, now = Date.now()): boolean {
  if (hidden) {
    hiddenAt = now;
    return false;
  }
  const relaunch = hiddenAt !== null && now - hiddenAt >= AWAY_COUNTS_AS_RELAUNCH_MS;
  hiddenAt = null;
  if (relaunch) launchedAt = now;
  return relaunch;
}

/** Called by the registration once a replacement worker is installed and idle. */
export function reportUpdateWaiting(apply: (reload?: boolean) => Promise<void>, now = Date.now()): void {
  updateWaiting = true;
  takeOver = apply;
  for (const listener of listeners) listener();
  if (now - launchedAt < LAUNCH_WINDOW_MS) installWaitingUpdate();
}

/**
 * Promote the waiting worker and reload onto it.
 *
 * The reload is not ours to schedule: workbox-window already listens for the
 * new worker taking control and reloads then, which is the only moment the page
 * is certain to come back on the new build rather than the old one.
 */
export function installWaitingUpdate(): void {
  void takeOver?.(true);
}
