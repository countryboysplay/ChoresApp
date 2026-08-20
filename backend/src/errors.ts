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
export interface ErrorHandlerOptions {
  /**
   * Serve the built frontend's index.html for anything that is not an API
   * path. Production runs the app and its API on one origin, so the two share
   * this handler: a mistyped endpoint must still come back as JSON, while a
   * saved home-screen shortcut or a hard refresh has to land on the app.
   *
   * There is one not-found handler per Fastify instance, which is why this is a
   * parameter rather than a second registration somewhere nearer the static
   * plugin - the second call throws at startup.
   */
  spaFallback?: boolean;
}

/**
 * Whether a path is asking for a file rather than a screen.
 *
 * Routing is entirely in the hash, so a real navigation is always the bare
 * origin and never has a dot in its last segment. Anything that does is asking
 * for something the build was supposed to emit.
 *
 * The distinction earns its keep: a dist missing sw.js once answered
 * /sw.js with index.html and a 200, the browser refused to register a worker
 * served as HTML, and the phones kept running an orphaned worker from an
 * earlier build that nothing could replace. A 404 would have said so at once.
 */
function looksLikeAFile(url: string): boolean {
  const path = url.split(/[?#]/)[0] ?? '';
  return path.slice(path.lastIndexOf('/') + 1).includes('.');
}

export function registerErrorHandler(app: FastifyInstance, options: ErrorHandlerOptions = {}): void {
  app.setNotFoundHandler((request, reply) => {
    if (options.spaFallback && !request.url.startsWith('/api/') && !looksLikeAFile(request.url)) {
      // Every screen lives after the hash, so this only ever sends the one
      // document; React decides what to draw once it has it.
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({
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
