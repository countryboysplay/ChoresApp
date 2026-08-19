import { api } from './api';

/**
 * Turning phone reminders on for this browser.
 *
 * Every state a phone can be in is named here rather than collapsed into a
 * boolean, because they need completely different sentences. "Your browser
 * cannot do this", "this address is not https", "the laptop has no keys yet",
 * and "you said no once" are four different problems, and a switch that just
 * fails to move is how a parent ends up believing the app is broken.
 *
 * There is no caching or offline behavior here and none in the worker. Push
 * needed a registered service worker; Stage 14 is what makes the app work
 * offline.
 */

export type PushState =
  /** No service worker or no PushManager - an older browser, or iOS Safari
   *  outside an installed home-screen app, which is the common one. */
  | 'unsupported'
  /** Not https and not localhost. The same rule that gates the camera. */
  | 'insecure'
  /** The server has no VAPID keys, so nothing could be sent yet. */
  | 'unconfigured'
  /** Notifications were refused for this site; only browser settings undo it. */
  | 'blocked'
  | 'off'
  | 'on';

/** Where the worker lives, honoring the Pages base path. */
const WORKER_URL = `${import.meta.env.BASE_URL}sw.js`;
const WORKER_SCOPE = import.meta.env.BASE_URL;

export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * The VAPID public key arrives base64url from the server and the browser wants
 * raw bytes. This is the one piece of encoding the frontend has to do itself.
 */
function decodeKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  // Backed by a plain ArrayBuffer rather than the default: applicationServerKey
  // will not take a view over a SharedArrayBuffer, which is what a bare
  // `new Uint8Array(n)` widens to in the DOM typings.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Registers the worker, once. Safe to call on every load: the browser returns
 * the existing registration rather than installing a second one.
 */
async function register(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(WORKER_SCOPE);
  if (existing) return existing;
  return navigator.serviceWorker.register(WORKER_URL, { scope: WORKER_SCOPE });
}

/** What to draw, without asking for anything or prompting anybody. */
export async function readPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  // Push and the camera share this rule: browsers expose neither over plain
  // http on a LAN address. Checked before the server call so the message is
  // about the address rather than about the household's keys.
  if (!window.isSecureContext) return 'insecure';

  let configured = false;
  try {
    configured = (await api.push.key()).configured;
  } catch {
    // No server, or signed out. Nothing can be turned on either way.
    return 'unconfigured';
  }
  if (!configured) return 'unconfigured';

  if (Notification.permission === 'denied') return 'blocked';

  const registration = await register();
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

/**
 * Asks for permission and subscribes. Returns the state to show afterwards, so
 * a refusal is a state change rather than a thrown error - the person did
 * answer the question, they just said no.
 */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';

  const { configured, publicKey } = await api.push.key();
  if (!configured || !publicKey) return 'unconfigured';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';

  const registration = await register();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Every push carries a payload, and browsers require this to be true
      // regardless. There is no silent-ping mode worth having here.
      userVisibleOnly: true,
      applicationServerKey: decodeKey(publicKey),
    }));

  await api.push.subscribe(subscription.toJSON() as PushSubscriptionPayload);
  return 'on';
}

/**
 * Turns reminders off on this phone. The browser subscription is dropped as
 * well as the server row: leaving it would mean the next sign-in silently
 * resubscribes somebody who deliberately turned it off.
 */
export async function disablePush(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';

  const registration = await navigator.serviceWorker.getRegistration(WORKER_SCOPE);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return 'off';

  // Server first. If the browser drops it and the delete fails, the row is
  // orphaned and keeps being sent to until the push service says it is gone.
  await api.push.unsubscribe(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
  return 'off';
}

/**
 * Re-registers an existing subscription against whoever is signed in now.
 *
 * A phone keeps its subscription across a sign-out, but the server row is
 * deleted with the session - so without this, a child who signs back in has a
 * browser that thinks it is subscribed and a household that will never send to
 * it. Called after sign-in, silent, and safe to fail: it can be recovered by
 * turning the switch off and on again.
 */
export async function resyncPush(): Promise<void> {
  if (!isPushSupported() || !window.isSecureContext) return;
  if (Notification.permission !== 'granted') return;

  const registration = await navigator.serviceWorker.getRegistration(WORKER_SCOPE);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await api.push.subscribe(subscription.toJSON() as PushSubscriptionPayload).catch(() => undefined);
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
