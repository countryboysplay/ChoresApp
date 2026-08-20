import type { FastifyInstance } from 'fastify';

/**
 * The way back for a phone whose service worker has captured it.
 *
 * A worker that is serving its own precached index.html and its own precached
 * assets is entirely self-consistent, so no amount of reloading escapes it, and
 * no fix shipped in the app's own JavaScript can reach it either - the stale
 * worker is what decides which JavaScript runs. On iOS that is not a passing
 * state: a home-screen app is suspended rather than closed and a pinned tab
 * lives for weeks, so a replacement worker waiting for "every tab closed" can
 * wait for good. Clearing Website Data by hand was the only way out.
 *
 * This is the seam. The worker's navigation route denies /api/, so a navigation
 * here is the one URL on the origin that always reaches the network, whatever
 * the worker thinks. The page it returns unregisters every worker on the
 * origin, deletes every cache, and goes back to the app.
 *
 * Deliberately unauthenticated. It reads nothing, writes nothing, and touches
 * only the browser that asked - the same things that browser could already do
 * through its own settings menu, in one tap instead of six. The global rate
 * limit still applies.
 */
export async function resetRoutes(app: FastifyInstance) {
  app.get('/api/reset', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    // Inline, because a page whose job is to escape a broken cache cannot go
    // asking that same cache for a stylesheet.
    return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reset Chore Quest</title>
<style>
  body {
    margin: 0; min-height: 100dvh; display: grid; place-items: center;
    padding: 24px; text-align: center; background: #0e1838; color: #e4ebff;
    font-family: system-ui, -apple-system, sans-serif; line-height: 1.5;
  }
  h1 { font-size: 1.5rem; margin: 0 0 12px; color: #fff; }
  p { margin: 0 0 16px; color: #9fb3e0; }
  a {
    display: inline-block; min-height: 48px; padding: 12px 24px; border-radius: 999px;
    background: #4d7cfe; color: #fff; text-decoration: none; font-weight: 700;
  }
</style>
<h1 id="heading">Clearing the old app&hellip;</h1>
<p id="detail">This only affects this phone. Nothing in the household is changed.</p>
<p><a id="back" href="/" hidden>Open Chore Quest</a></p>
<script>
  (async () => {
    const heading = document.getElementById('heading');
    const detail = document.getElementById('detail');
    const back = document.getElementById('back');
    let workers = 0;
    let caches_ = 0;
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          if (await registration.unregister()) workers += 1;
        }
      }
      if ('caches' in window) {
        const names = await caches.keys();
        for (const name of names) {
          if (await caches.delete(name)) caches_ += 1;
        }
      }
      heading.textContent = 'Done.';
      detail.textContent =
        workers + (workers === 1 ? ' worker' : ' workers') + ' and ' +
        caches_ + (caches_ === 1 ? ' cache' : ' caches') +
        ' cleared. Opening the app again loads the current version.';
    } catch (error) {
      // Saying what went wrong beats a page that sits on "Clearing..." forever.
      heading.textContent = 'That did not work.';
      detail.textContent =
        'Clear this site in Settings → Safari → Advanced → Website Data. (' +
        String(error) + ')';
    }
    back.hidden = false;
  })();
</script>
</html>`;
  });
}
