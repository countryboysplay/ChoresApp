import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@chore-quest/shared';
import type { Env } from '../env.js';
import { checkDatabase } from '../db.js';
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
    // A real probe. `status` stays 'ok' even when the database is unreachable:
    // this endpoint answers "is the API up", and the database line is one of the
    // facts it reports. Collapsing the two would make the tunnel health check
    // flap on a transient Postgres restart.
    database: await checkDatabase(),
  }));
}
