import { buildApp } from './app.js';
import { closePool, getPool } from './db.js';
import { env } from './env.js';
import { startScheduler } from './notifications/scheduler.js';

async function main(): Promise<void> {
  const app = await buildApp({ env });

  // Reminders are the one thing here that has to happen when nobody is looking,
  // so this is the only timer in the project. It sweeps immediately at startup
  // too, which is what makes a restart at 9:20pm still deliver the 8:45pm
  // reminder rather than swallowing the evening - and now, on the same tick,
  // put that reminder on the child's phone.
  const pool = getPool();
  const scheduler = pool ? startScheduler(pool, env, app.log) : null;
  if (scheduler) void scheduler.runNow();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    scheduler?.stop();
    await app.close();
    // After the server stops accepting requests, so nothing is mid-query.
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Chore Quest API on http://${env.HOST}:${env.PORT}/api/health`);
  } catch (error) {
    app.log.error({ err: error }, 'failed to start');
    process.exit(1);
  }
}

void main();
