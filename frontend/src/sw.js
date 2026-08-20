import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

/*
 * Chore Quest service worker.
 *
 * Stage 13 gave this file a push handler and nothing else. Stage 14 adds the
 * cached shell, and the two rules that keep the caching honest:
 *
 * 1. THE SHELL IS CACHED. THE DATA IS NEVER. Only what the build produced -
 *    HTML, JS, CSS, fonts, icons - is precached. Not one API response is
 *    stored. A child looking at a cached chore list cannot tell it is stale: a
 *    chore approved ten minutes ago still reads as pending, ticks go nowhere,
 *    and an app that quietly lies about what has been done is worse than one
 *    that says plainly it is offline. So offline gets the app's own face on an
 *    honest screen, and that is the whole benefit being claimed.
 *
 * 2. A NEW VERSION WAITS FOR THE NEXT LAUNCH. Owner decision. Stage 13 called
 *    skipWaiting() and clients.claim(), which was safe only because nothing was
 *    cached and there was no older version to disagree with. That is no longer
 *    true, and both are now gone. A new worker installs, waits, and takes over
 *    when every tab has closed - so nobody is reloaded out from under a
 *    half-finished checklist or a photo capture, and no kid is shown a dialog
 *    they will dismiss forever. The cost is running yesterday's build for one
 *    more session, which is the cheaper failure.
 */

// The build replaces this with the list of files it emitted, each with its own
// revision. cleanupOutdatedCaches then removes what a previous version left, so
// the cache does not grow by one whole app per deploy.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/*
 * Navigations are answered from the cached index.html.
 *
 * Safe here in a way it would not be in most apps: routing is entirely in the
 * hash, so every screen in Chore Quest is the same document and there is no
 * server-rendered page whose contents could be wrong. Anything the shell then
 * asks the API for still goes to the network, and still fails honestly when
 * there is nobody home - which is what raises the offline screen.
 *
 * Registered through Workbox's router rather than as a second `fetch` listener
 * of our own. Workbox already installs one, and its precache route resolves a
 * bare "/" to index.html by itself, so a hand-rolled listener would be the
 * second handler to call respondWith on the same navigation - which throws.
 */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    // Never serve the app shell in place of an API call. An unreachable server
    // has to reach the app as an unreachable server.
    denylist: [/^\/api\//],
  }),
);

/**
 * The scope this worker was registered under - "/" in dev, "/ChoresApp/" on
 * Pages - which is also the app's root. Deep links are hash paths, so opening
 * one is this plus the hash.
 */
function appUrl(hash) {
  const root = new URL(self.registration.scope);
  root.hash = hash && hash.startsWith('#') ? hash : '';
  return root.href;
}

self.addEventListener('push', (event) => {
  // A push with no readable payload still means something happened, so it is
  // shown rather than swallowed. Phones show *something* for a push they were
  // told about; a silent failure here reads as a broken app.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'Chore Quest';
  const options = {
    body: data.body || 'Open Chore Quest to see what changed.',
    icon: `${self.registration.scope}icon-192.png`,
    badge: `${self.registration.scope}icon-192.png`,
    // Replaces rather than stacks when the same chore is pushed again. Nothing
    // does that today - a notification is sent once - but a stack of four
    // identical reminders is the failure worth being immune to.
    tag: data.id ? `cq-${data.id}` : 'cq',
    renotify: false,
    data: { deepLink: data.deepLink || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = appUrl(event.notification.data && event.notification.data.deepLink);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Reuse a tab the household already has open rather than piling up a new
      // one per reminder. On a phone that is the difference between one app and
      // a stack of them in the switcher.
      for (const client of windows) {
        if (!client.url.startsWith(new URL(self.registration.scope).origin)) continue;
        await client.focus();
        if ('navigate' in client) await client.navigate(target).catch(() => undefined);
        return;
      }

      await self.clients.openWindow(target);
    })(),
  );
});
