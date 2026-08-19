import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { deviceLabelFrom } from '../auth/sessions.js';
import { pushConfig } from '../notifications/push.js';

/**
 * Subscribing a phone, and unsubscribing it.
 *
 * A subscription belongs to a browser rather than to a person. The endpoint is
 * minted by the phone's push service and is the same string whoever is signed
 * in, so it is the unique key and signing in as somebody else moves the row
 * across rather than adding a second one. On a shared tablet that is the
 * difference between the reminders following whoever is using it and the first
 * child's chores buzzing at the second child all evening.
 */

const SubscribeBody = z.object({
  // Push services hand out long URLs; the cap is a sanity bound, not a spec
  // limit. https only - a push endpoint is never anything else.
  endpoint: z.string().url().max(2048).startsWith('https://'),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

const UnsubscribeBody = z.object({
  endpoint: z.string().url().max(2048),
});

export async function pushRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;
  const requireAnyone = app.requireAuth();
  const requireParent = app.requireAuth(['parent']);

  const pool = () => {
    const active = getPool();
    if (!active) throw app.httpErrors.serviceUnavailable('The database is not configured.');
    return active;
  };

  /**
   * The key the browser needs before it can subscribe.
   *
   * Served rather than baked into the bundle because the GitHub Pages preview
   * is built without a backend and would carry a key that matches nothing. A
   * VAPID public key is public by definition; it identifies the sender to the
   * push service and authorises nothing on its own.
   */
  app.get('/api/push/key', { onRequest: requireAnyone }, async () => {
    const config = pushConfig(env);
    return {
      configured: config !== null,
      publicKey: config?.publicKey ?? null,
    };
  });

  /**
   * Registers this browser, or moves an existing registration to whoever is
   * signed in now. Succeeds even when the server has no VAPID keys: the
   * browser's permission prompt has already been answered by then, and telling
   * someone "that did not work" after they said yes is worse than storing the
   * subscription and reporting honestly that nothing will arrive yet.
   */
  app.post('/api/push/subscribe', { onRequest: requireAnyone }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const parsed = SubscribeBody.safeParse(request.body);
    if (!parsed.success) throw app.httpErrors.badRequest('That is not a usable push subscription.');

    const { endpoint, keys } = parsed.data;

    await pool().query(
      `INSERT INTO push_subscriptions
         (user_id, session_id, endpoint, p256dh, auth, device_label)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE
          SET user_id      = EXCLUDED.user_id,
              session_id   = EXCLUDED.session_id,
              p256dh       = EXCLUDED.p256dh,
              auth         = EXCLUDED.auth,
              device_label = EXCLUDED.device_label,
              created_at   = now()`,
      [
        session.user.id,
        session.sessionId,
        endpoint,
        keys.p256dh,
        keys.auth,
        deviceLabelFrom(request.headers['user-agent']),
      ],
    );

    return { ok: true, configured: pushConfig(env) !== null };
  });

  /**
   * Turning reminders off on this phone. Scoped to the signed-in person, so a
   * guessed endpoint cannot silence somebody else's device.
   */
  app.delete('/api/push/subscribe', { onRequest: requireAnyone }, async (request) => {
    const session = request.session;
    if (!session) throw app.httpErrors.unauthorized();

    const parsed = UnsubscribeBody.safeParse(request.body);
    if (!parsed.success) throw app.httpErrors.badRequest('That is not a usable push subscription.');

    const { rowCount } = await pool().query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2',
      [parsed.data.endpoint, session.user.id],
    );

    // Not an error when there was nothing to remove. The browser may have
    // dropped the subscription itself, and the desired state is the same.
    return { ok: true, removed: rowCount ?? 0 };
  });

  /** What the System status screen reports. Counts, never endpoints. */
  app.get('/api/push/status', { onRequest: requireParent }, async () => {
    const { rows } = await pool().query<{ devices: number }>(
      'SELECT count(*)::int AS devices FROM push_subscriptions',
    );
    return {
      configured: pushConfig(env) !== null,
      devices: rows[0]?.devices ?? 0,
    };
  });
}
