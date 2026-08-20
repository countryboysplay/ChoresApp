import { registerSW } from 'virtual:pwa-register';
import { reportUpdateWaiting } from './appUpdate';

/**
 * Registers the service worker, once, for the whole app.
 *
 * One place does this rather than each feature that needs a worker. Push wants
 * one registered so a notification can arrive with the app closed; caching
 * wants one so the app opens at all when the laptop is asleep. They are the
 * same worker, and two callers racing to register it is how you end up with a
 * subscription attached to a registration that is about to be replaced.
 *
 * Deliberately not `immediate`. Registration competes with the first render for
 * the network, and on the kids' phones the app appearing quickly matters more
 * than the cache being warm a second earlier - the cache is for the *next*
 * launch either way.
 */
export function registerServiceWorker(): void {
  // Every browser that can do push can do this, but a plain http LAN address
  // can do neither, and that is the common way in on the house wifi.
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  const takeOver = registerSW({
    immediate: false,
    // Named onNeedRefresh, but it refreshes nothing. Owner decision, unchanged:
    // a new version waits and takes over on the next launch, and nobody is
    // shown a dialog they will dismiss forever. All this does is record that
    // there is something to take over to, for the one screen that offers it.
    onNeedRefresh() {
      reportUpdateWaiting(takeOver);
    },
    onRegisterError(error) {
      // Not fatal. Without a worker the app still works whenever the laptop is
      // reachable, which is almost always - it just loses offline and push.
      console.warn('service worker registration failed', error);
    },
  });
}
