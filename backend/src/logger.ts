import type { FastifyServerOptions } from 'fastify';
import type { Env } from './env.js';

/**
 * Structured logging: readable in development, JSON lines in production so the
 * Windows host can tail them to a file without post-processing.
 */
export function loggerOptions(env: Env): FastifyServerOptions['logger'] {
  if (env.NODE_ENV === 'test') return false;

  if (env.NODE_ENV === 'development') {
    return {
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      },
    };
  }

  return {
    level: 'info',
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[redacted]',
    },
  };
}
