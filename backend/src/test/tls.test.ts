/**
 * Serving the household over https on the home wifi.
 *
 * Two properties matter here and neither is about cryptography. The first is
 * that the frontend and the API share an origin, because a third-party session
 * cookie is blocked outright by Safari on iOS and the kids are the ones on
 * phones. The second is that the app degrades to plain http rather than
 * refusing to start: a household whose certificate expired should lose the
 * camera, not the app.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { cookieOptions } from '../auth/plugin.js';
import { canRenew, certificatePaths, readCertificateState } from '../tls/certificate.js';
import { testConnectionString } from './database.js';

const connectionString = testConnectionString;

const base = {
  NODE_ENV: 'test',
  PORT: '4013',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: 'America/Chicago',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: connectionString,
  SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
} as NodeJS.ProcessEnv;

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'cq-tls-'));
});

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe('the session cookie', () => {
  it('is not marked Secure on a plain development server', () => {
    const options = cookieOptions(loadEnv(base));
    // Marking it Secure over http would mean the browser never sends it back,
    // and nobody could stay signed in on the laptop.
    expect(options.secure).toBe(false);
  });

  it('is marked Secure as soon as the household is served over https', () => {
    const options = cookieOptions(loadEnv({ ...base, TLS_DIR: './tls' } as NodeJS.ProcessEnv));
    // Keyed off TLS_DIR rather than NODE_ENV: the laptop runs in development
    // mode, and would otherwise hand the kids' phones a cookie the browser is
    // free to send in the clear on the one network they use.
    expect(options.secure).toBe(true);
  });

  it('stays first-party by never needing a cross-site cookie', () => {
    const options = cookieOptions(loadEnv(base));
    // 'lax' is only sufficient because the frontend and API share an origin in
    // production. If that ever stops being true this has to be revisited, not
    // loosened to 'none'.
    expect(options.sameSite).toBe('lax');
    expect(options.httpOnly).toBe(true);
  });
});

describe('serving the frontend from the backend', () => {
  it('answers a deep link with the app rather than a 404', async () => {
    const dist = join(workDir, 'dist');
    await mkdir(dist, { recursive: true });
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>Chore Quest</title>');

    const app = await buildApp({
      env: loadEnv({ ...base, FRONTEND_DIST: dist } as NodeJS.ProcessEnv),
    });

    // A saved home-screen shortcut or a hard refresh has to land somewhere.
    const response = await app.inject({ method: 'GET', url: '/parent/settings' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Chore Quest');

    await app.close();
  });

  it('still answers an unknown API path as an API error', async () => {
    const dist = join(workDir, 'dist2');
    await mkdir(dist, { recursive: true });
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>Chore Quest</title>');

    const app = await buildApp({
      env: loadEnv({ ...base, FRONTEND_DIST: dist } as NodeJS.ProcessEnv),
    });

    // Handing index.html back for a mistyped endpoint would turn every API
    // typo into a client parsing HTML as JSON.
    const response = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');

    await app.close();
  });

  it('answers a missing file with a 404 rather than the app', async () => {
    const dist = join(workDir, 'dist3');
    await mkdir(dist, { recursive: true });
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>Chore Quest</title>');

    const app = await buildApp({
      env: loadEnv({ ...base, FRONTEND_DIST: dist } as NodeJS.ProcessEnv),
    });

    // A build that forgets to emit the service worker used to be invisible:
    // /sw.js came back as index.html with a 200, the browser refused to
    // register a worker served as HTML, and every phone stayed on an orphaned
    // worker from an earlier build. Saying "not here" is what makes it fixable.
    const response = await app.inject({ method: 'GET', url: '/sw.js' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');

    // A screen still lands on the app: no dot, so it is a route, not a file.
    const screen = await app.inject({ method: 'GET', url: '/parent/settings' });
    expect(screen.statusCode).toBe(200);

    await app.close();
  });

  it('does not serve anything when no frontend is configured', async () => {
    const app = await buildApp({ env: loadEnv(base) });
    // Local development keeps Vite on its own port; the backend serving a stale
    // dist alongside it is how you debug the wrong bundle for an hour.
    const response = await app.inject({ method: 'GET', url: '/parent/settings' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('the certificate', () => {
  it('reports its absence as a state rather than throwing', async () => {
    const state = await readCertificateState(
      loadEnv({ ...base, TLS_DIR: join(workDir, 'nothing-here') } as NodeJS.ProcessEnv),
    );
    expect(state.present).toBe(false);
    expect(state.daysRemaining).toBeNull();
  });

  it('knows it cannot renew until everything renewal needs is set', () => {
    expect(canRenew(loadEnv(base))).toBe(false);

    const partial = loadEnv({
      ...base,
      PUBLIC_HOSTNAME: 'chores.example.com',
      TLS_DIR: join(workDir, 'tls'),
      ACME_EMAIL: 'someone@example.com',
    } as NodeJS.ProcessEnv);
    // Missing the Cloudflare pair. Reported honestly so System status can say
    // "renew by hand" rather than implying it will happen by itself.
    expect(canRenew(partial)).toBe(false);

    const full = loadEnv({
      ...base,
      PUBLIC_HOSTNAME: 'chores.example.com',
      TLS_DIR: join(workDir, 'tls'),
      ACME_EMAIL: 'someone@example.com',
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ZONE_ID: 'zone',
    } as NodeJS.ProcessEnv);
    expect(canRenew(full)).toBe(true);
  });

  it('puts the certificate and key beside each other where they were asked for', () => {
    const paths = certificatePaths(
      loadEnv({ ...base, TLS_DIR: join(workDir, 'tls') } as NodeJS.ProcessEnv),
    );
    expect(paths?.cert).toContain('certificate.pem');
    expect(paths?.key).toContain('private-key.pem');
  });

  it('has no paths at all when TLS is not configured', () => {
    expect(certificatePaths(loadEnv(base))).toBeNull();
  });
});
