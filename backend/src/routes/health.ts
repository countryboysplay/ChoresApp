import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@chore-quest/shared';
import type { Env } from '../env.js';
import { householdNow, householdToday } from '../time.js';

/**
 * Public liveness endpoint. Deliberately leaks nothing about the household -
 * no names, no counts, no secrets - because it is reachable from the tunnel.
 */
export async function healthRoutes(app: FastifyInstance, opts: { env: Env; version: string }) {
  const started = Date.now();

  app.get('/api/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    version: opts.version,
    environment: opts.env.NODE_ENV,
    uptimeSeconds: Math.round((Date.now() - started) / 1000),
    household: {
      timezone: opts.env.HOUSEHOLD_TZ,
      localTime: householdNow(opts.env.HOUSEHOLD_TZ),
      choreDate: householdToday(opts.env.HOUSEHOLD_TZ),
    },
    // Stage 3 replaces this with a real connection probe.
    database: 'not_configured',
  }));
}
