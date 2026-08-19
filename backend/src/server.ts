import { buildApp } from './app.js';
import { closePool } from './db.js';
import { env } from './env.js';

async function main(): Promise<void> {
  const app = await buildApp({ env });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
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
