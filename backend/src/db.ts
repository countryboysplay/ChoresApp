import pg from 'pg';
import './pg-parsers.js';
import { env } from './env.js';

/**
 * The thin query layer. Deliberately not an ORM: callers write SQL, and this
 * module owns the pool, the shutdown, and the health probe.
 *
 * Type parsing lives in ./pg-parsers.js because it is global to the pg module
 * and has to apply to every connection, not only the pool created here.
 */

let pool: pg.Pool | undefined;

/** Null when DATABASE_URL is unset, which is a valid state before Stage 4. */
export function getPool(): pg.Pool | null {
  if (!env.DATABASE_URL) return null;

  pool ??= new pg.Pool({
    connectionString: env.DATABASE_URL,
    // The backend serves one household on one laptop. A large pool would only
    // reserve Postgres connections that nothing is waiting to use.
    max: 10,
    idleTimeoutMillis: 30_000,
    // Fail fast rather than hanging a request while Postgres is down.
    connectionTimeoutMillis: 5_000,
  });

  return pool;
}

export type DatabaseHealth = 'not_configured' | 'connected' | 'unreachable';

/**
 * Used by GET /api/health. Never throws: an unreachable database is a health
 * result to report, not an error that takes the health endpoint down with it.
 */
export async function checkDatabase(): Promise<DatabaseHealth> {
  const active = getPool();
  if (!active) return 'not_configured';

  try {
    await active.query('SELECT 1');
    return 'connected';
  } catch {
    return 'unreachable';
  }
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = undefined;
  await closing.end();
}
