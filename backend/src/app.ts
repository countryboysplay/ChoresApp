import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { loadEnv, type Env } from './env.js';
import { loggerOptions } from './logger.js';
import { registerErrorHandler } from './errors.js';
import { auth } from './auth/plugin.js';
import { approvalRoutes } from './routes/approvals.js';
import { authRoutes } from './routes/auth.js';
import { bonusRoutes } from './routes/bonus.js';
import { choreAdminRoutes } from './routes/chore-admin.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { householdRoutes } from './routes/household.js';
import { choreRoutes } from './routes/chores.js';
import { photoRoutes } from './routes/photos.js';
import { healthRoutes } from './routes/health.js';
import { rewardRoutes } from './routes/rewards.js';
import { walletRoutes } from './routes/wallet.js';

export const APP_VERSION = '0.1.0';

export interface BuildOptions {
  env?: Env;
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();

  const app = Fastify({
    logger: loggerOptions(env),
    trustProxy: true,
    bodyLimit: 12 * 1024 * 1024, // room for a single chore-proof photo later
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

  registerErrorHandler(app);

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
  await app.register(walletRoutes, { env });
  await app.register(healthRoutes, { env, version: APP_VERSION });

  app.decorate('env', env);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
  }
}
