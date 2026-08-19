import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { loadEnv, type Env } from './env.js';
import { loggerOptions } from './logger.js';
import { registerErrorHandler } from './errors.js';
import { healthRoutes } from './routes/health.js';

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
  await app.register(helmet, { contentSecurityPolicy: false });

  // Stage 1: localhost only. Stage 16 adds the tunnel origin, Stage 17 the Pages origin.
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  registerErrorHandler(app);
  await app.register(healthRoutes, { env, version: APP_VERSION });

  app.decorate('env', env);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
  }
}
