import { createServer } from 'node:http';
import { buildApp } from './app.js';
import { closePool, getPool } from './db.js';
import { env } from './env.js';
import { startScheduler } from './notifications/scheduler.js';
import { loadCertificate } from './tls/certificate.js';

async function main(): Promise<void> {
  /*
   * https when there is a certificate, plain http when there is not.
   *
   * Browsers only expose the camera and the Push API in a secure context, so
   * plain http on a LAN address means a child can never photograph a finished
   * chore from their own phone. The certificate is issued for a real hostname
   * that resolves to this laptop's address on the home wifi, so it is trusted
   * with nothing installed on any phone - and unreachable from outside the
   * house, which is the owner's decision and the reason there is no tunnel.
   *
   * Falling back to http rather than refusing to start is deliberate. A
   * household whose certificate expired should lose the camera, not the app.
   */
  const certificate = await loadCertificate(env);
  const app = await buildApp({ env, https: certificate });

  // Reminders are the one thing here that has to happen when nobody is looking,
  // so this is the only timer in the project. It sweeps immediately at startup
  // too, which is what makes a restart at 9:20pm still deliver the 8:45pm
  // reminder rather than swallowing the evening - and now, on the same tick,
  // put that reminder on the child's phone, take the night's backup, and renew
  // the certificate before it runs out.
  const pool = getPool();
  const scheduler = pool ? startScheduler(pool, env, app.log) : null;
  if (scheduler) void scheduler.runNow();

  /*
   * A redirect on port 80, only when serving https.
   *
   * Nobody types a scheme. A child opening a bookmark, or a parent reading the
   * hostname off a note on the fridge, gets http first - and without this that
   * is a connection refused rather than the app.
   */
  const redirector =
    certificate && env.PUBLIC_HOSTNAME
      ? createServer((request, response) => {
          const host = env.PUBLIC_HOSTNAME as string;
          const port = env.HTTPS_PORT === 443 ? '' : `:${env.HTTPS_PORT}`;
          response.writeHead(308, { location: `https://${host}${port}${request.url ?? '/'}` });
          response.end();
        })
      : null;

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    scheduler?.stop();
    redirector?.close();
    await app.close();
    // After the server stops accepting requests, so nothing is mid-query.
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    const port = certificate ? env.HTTPS_PORT : env.PORT;
    // 0.0.0.0 when serving the household, so phones on the wifi can reach it.
    // Loopback otherwise, which is the development default and stays closed.
    const host = certificate ? '0.0.0.0' : env.HOST;

    await app.listen({ port, host });

    if (certificate) {
      redirector?.listen(80, '0.0.0.0', () => {
        app.log.info('redirecting http on port 80 to https');
      });
      app.log.info(`Chore Quest on https://${env.PUBLIC_HOSTNAME ?? 'this laptop'}/`);
    } else {
      app.log.info(`Chore Quest API on http://${env.HOST}:${env.PORT}/api/health`);
      if (env.TLS_DIR) {
        // Said out loud rather than left to be noticed. Silence here would read
        // as "https is on" to anybody who had configured it.
        app.log.warn(
          'TLS_DIR is set but no certificate was found, so this is plain http. ' +
            'The camera and phone notifications will not work off this laptop.',
        );
      }
    }
  } catch (error) {
    app.log.error({ err: error }, 'failed to start');
    process.exit(1);
  }
}

void main();
