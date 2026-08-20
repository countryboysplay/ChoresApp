/**
 * Whether a new version has installed and is waiting to take over.
 *
 * Its own module, deliberately. The registration in serviceWorker.ts imports
 * `virtual:pwa-register`, which only exists once Vite has built it - so a screen
 * that imported the store from there would drag a build-time virtual module
 * into every test that renders the app. The store is plain state and belongs
 * apart from the thing that fills it in.
 *
 * A store rather than a prompt. The worker still refuses to activate by itself
 * (see the comment in sw.js), so knowing an update is waiting changes nothing
 * for a child - no dialog, no reload, nothing on screen. It is read in exactly
 * one place, the parent System status screen, which offers a parent the choice
 * that iOS otherwise never gets round to giving anybody.
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

/** Called by the registration once a replacement worker is installed and idle. */
export function reportUpdateWaiting(apply: (reload?: boolean) => Promise<void>): void {
  updateWaiting = true;
  takeOver = apply;
  for (const listener of listeners) listener();
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
