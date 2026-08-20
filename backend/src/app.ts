import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { isAbsolute, resolve } from 'node:path';
import { loadEnv, type Env } from './env.js';
import { loggerOptions } from './logger.js';
import { registerErrorHandler } from './errors.js';
import { applyPushConfig, pushConfig } from './notifications/push.js';
import { auth } from './auth/plugin.js';
import { approvalRoutes } from './routes/approvals.js';
import { authRoutes } from './routes/auth.js';
import { backupRoutes } from './routes/backups.js';
import { bonusRoutes } from './routes/bonus.js';
import { choreAdminRoutes } from './routes/chore-admin.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { notificationRoutes } from './routes/notifications.js';
import { householdRoutes } from './routes/household.js';
import { choreRoutes } from './routes/chores.js';
import { photoRoutes } from './routes/photos.js';
import { pushRoutes } from './routes/push.js';
import { healthRoutes } from './routes/health.js';
import { rewardRoutes } from './routes/rewards.js';
import { tlsRoutes } from './routes/tls.js';
import { walletRoutes } from './routes/wallet.js';

export const APP_VERSION = '0.1.0';

export interface BuildOptions {
  env?: Env;
  /** Certificate and key. Present turns this into an https server. */
  https?: { cert: string; key: string } | null;
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();

  const app = Fastify({
    logger: loggerOptions(env),
    trustProxy: true,
    bodyLimit: 12 * 1024 * 1024, // room for a single chore-proof photo later
    ...(options.https ? { https: options.https } : {}),
  });

  await app.register(sensible);
  // Photo upload. The per-request cap is enforced at the route so the error is
  // a clear "that photo is too large" rather than a connection reset.
  await app.register(multipart);
  await app.register(helmet, { contentSecurityPolicy: false });

  // Fastify's built-in JSON parser rejects an empty body as malformed. Plenty of
  // actions here are a bare POST with nothing to send - logout, claim a bonus
  // chore, approve a submission - and the browser still labels those
  // application/json. Treat an empty body as "no body" rather than an error.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      const raw = typeof body === 'string' ? body.trim() : '';
      if (raw === '') {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(raw));
      } catch {
        done(app.httpErrors.badRequest('The request body is not valid JSON.'), undefined);
      }
    },
  );

  // A backstop for the whole API. Individual routes tighten this - see the PIN
  // login, which is the one endpoint worth guessing at.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // The household shares one address, so a per-IP limit has to be generous
    // enough for several people using the app at once.
    keyGenerator: (request) => request.ip,
  });

  // In development the frontend is a separate Vite origin. In production the
  // backend serves the built frontend from the same origin, so this list is
  // only about dev and the Stage 16 tunnel hostname.
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  registerErrorHandler(app, { spaFallback: Boolean(env.FRONTEND_DIST) });

  // Applied here rather than at the first send, so a malformed VAPID key is a
  // startup failure instead of a reminder that silently never arrives. Absent
  // keys are not an error: push is simply off, exactly like cash-out before a
  // rate is set.
  const push = pushConfig(env);
  if (push) applyPushConfig(push);

  await app.register(auth, { env });
  await app.register(authRoutes, { env });
  await app.register(choreRoutes, { env });
  await app.register(photoRoutes, { env });
  await app.register(approvalRoutes, { env });
  await app.register(bonusRoutes, { env });
  await app.register(rewardRoutes, { env });
  await app.register(householdRoutes, { env });
  await app.register(choreAdminRoutes, { env });
  await app.register(dashboardRoutes, { env });
  await app.register(notificationRoutes, { env });
  await app.register(pushRoutes, { env });
  await app.register(backupRoutes, { env });
  await app.register(tlsRoutes, { env });
  await app.register(walletRoutes, { env });
  await app.register(healthRoutes, { env, version: APP_VERSION });

  // The built frontend, from the same origin as the API.
  //
  // Session cookies are the whole reason. A frontend on one hostname and an API
  // on another makes the cookie third-party, which Safari on iOS blocks
  // outright - and the kids are the ones on phones, so a login that silently
  // stops sticking would be the worst failure this app could have. Same origin
  // removes the problem instead of working around it.
  //
  // Only when FRONTEND_DIST is set. Local development keeps Vite on its own
  // port, which is why CORS still exists above. The SPA fallback for everything
  // that is not a file lives in the not-found handler, because Fastify allows
  // exactly one of those and the error handler already owns it.
  if (env.FRONTEND_DIST) {
    const root = isAbsolute(env.FRONTEND_DIST)
      ? env.FRONTEND_DIST
      : resolve(process.cwd(), env.FRONTEND_DIST);

    await app.register(fastifyStatic, { root });
  }

  app.decorate('env', env);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
  }
}
