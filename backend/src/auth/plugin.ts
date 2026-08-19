import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import type { Role } from '@chore-quest/shared';
import type { Env } from '../env.js';
import { getPool } from '../db.js';
import { resolveSession, type AuthenticatedSession } from './sessions.js';

export const SESSION_COOKIE = 'cq_session';

declare module 'fastify' {
  interface FastifyRequest {
    /** Present only after requireAuth, or when a valid cookie was sent. */
    session?: AuthenticatedSession;
  }
  interface FastifyInstance {
    requireAuth: (roles?: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function cookieOptions(env: Env) {
  return {
    httpOnly: true,
    // Production serves the frontend and the API from the same origin, so the
    // cookie is first-party and 'lax' is enough. It also survives the return
    // trip from an external link, which 'strict' would not.
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    signed: true,
  };
}

async function authPlugin(app: FastifyInstance, opts: { env: Env }): Promise<void> {
  const { env } = opts;

  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    // Fail at startup rather than issuing cookies nobody can trust. The env
    // loader keeps this optional because Stages 1-3 had no sessions to sign.
    throw new Error(
      'SESSION_SECRET must be set to at least 32 characters before authentication can start. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }

  await app.register(cookie, { secret: env.SESSION_SECRET });

  // Reads the cookie if there is one, but never rejects. Routes that require a
  // session say so themselves, so a public route cannot accidentally become
  // authenticated-only by being registered in the wrong order.
  app.addHook('onRequest', async (request) => {
    const raw = request.cookies[SESSION_COOKIE];
    if (!raw) return;

    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;

    const pool = getPool();
    if (!pool) return;

    const session = await resolveSession(pool, unsigned.value);
    if (session) request.session = session;
  });

  app.decorate('requireAuth', (roles?: Role[]) => async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.session) {
      await reply.code(401).send({
        error: { code: 'not_authenticated', message: 'Sign in to continue.' },
      });
      return;
    }

    if (roles && !roles.includes(request.session.user.role)) {
      // Deliberately not 404. The client knows who it is signed in as, so
      // hiding the route's existence buys nothing and confuses the UI.
      await reply.code(403).send({
        error: { code: 'forbidden', message: 'That area is for parents.' },
      });
    }
  });
}

export const auth = fp(authPlugin, { name: 'chore-quest-auth' });
