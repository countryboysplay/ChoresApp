import type { FastifyInstance } from 'fastify';
import type { Env } from '../env.js';
import { RENEW_WITHIN_DAYS, readCertificateState } from '../tls/certificate.js';

/**
 * What System status says about https.
 *
 * Worth a row of its own because the failure is silent otherwise: an expired
 * certificate does not stop the app, it stops the camera and phone
 * notifications, and it does so on a Tuesday with no announcement. A number of
 * days remaining on a screen is what turns that into something noticed.
 */
export async function tlsRoutes(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;
  const requireParent = app.requireAuth(['parent']);

  app.get('/api/parent/certificate', { onRequest: requireParent }, async () => {
    const state = await readCertificateState(env);
    return {
      ...state,
      hostnameConfigured: Boolean(env.PUBLIC_HOSTNAME),
      renewWithinDays: RENEW_WITHIN_DAYS,
      // The connection this very request arrived on. A certificate can exist on
      // disk while the server is still serving plain http, because the listener
      // only picks it up at startup.
      servingHttps: app.env.TLS_DIR !== undefined,
    };
  });
}
