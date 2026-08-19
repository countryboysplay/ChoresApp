/*
 * Chore Quest service worker - push only.
 *
 * This does one job: receive a push and show it, and put the right screen in
 * front of whoever taps it. There is deliberately no caching here. Offline
 * support, the install prompt, and the prompt-to-update flow are Stage 14, and
 * they carry a risk this file does not - a precache that serves a stale bundle
 * is the kind of bug that hides for a week and then breaks a screen for
 * everyone at once. Push needed a registered worker; it did not need that.
 *
 * Written by hand rather than generated. At this size a build plugin would be
 * more machinery than code, and Stage 14 can replace the whole file when it
 * brings one in.
 */

// No install-time work, so take over immediately rather than waiting for every
// tab to close. There is nothing cached for an older version to disagree with.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
    icon: 'icon-192.png',
    badge: 'icon-192.png',
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
