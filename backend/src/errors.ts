import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Every thrown error becomes a client-safe response here. Internal messages are
 * never forwarded to the browser.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: { code: 'not_found', message: `No route for ${request.method} ${request.url}` },
    } satisfies ApiErrorBody);
  });

  app.setErrorHandler((error: FastifyError | ZodError, request, reply) => {
    if (error instanceof ZodError) {
      request.log.info({ issues: error.issues }, 'request validation failed');
      reply.code(400).send({
        error: {
          code: 'validation_failed',
          message: 'The request was not valid.',
          details: error.issues,
        },
      } satisfies ApiErrorBody);
      return;
    }

    const fastifyError = error as FastifyError;
    const status = fastifyError.statusCode ?? 500;

    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled server error');
      reply.code(status).send({
        error: { code: 'internal_error', message: 'Something went wrong. Try again.' },
      } satisfies ApiErrorBody);
      return;
    }

    request.log.info({ err: error }, 'client error');
    reply.code(status).send({
      error: { code: error.code ?? 'request_failed', message: error.message },
    } satisfies ApiErrorBody);
  });
}
