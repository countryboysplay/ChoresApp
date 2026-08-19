import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { householdToday, householdWeekday } from '../time.js';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  PORT: '4001',
  HOST: '127.0.0.1',
  HOUSEHOLD_TZ: 'America/Chicago',
  CORS_ORIGINS: 'http://localhost:5173',
  // buildApp registers the auth plugin, which refuses to start without a
  // secret long enough to sign session cookies with.
  SESSION_SECRET: 'test-secret-that-is-comfortably-long-enough-to-pass',
} as NodeJS.ProcessEnv);

describe('GET /api/health', () => {
  it('reports ok with household time context', async () => {
    const app = await buildApp({ env: testEnv });
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.household.timezone).toBe('America/Chicago');
    expect(body.household.choreDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await app.close();
  });

  it('returns a structured 404 for unknown routes', async () => {
    const app = await buildApp({ env: testEnv });
    const response = await app.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
    await app.close();
  });
});

describe('household time', () => {
  it('uses the household timezone, not UTC, across the DST boundary', () => {
    // 2026-03-08 06:30 UTC is still 2026-03-08 00:30 in Chicago (CST, UTC-6).
    const beforeSpringForward = new Date('2026-03-08T06:30:00Z');
    expect(householdToday('America/Chicago', beforeSpringForward)).toBe('2026-03-08');

    // 2026-11-01 05:30 UTC is 2026-11-01 00:30 in Chicago (CDT, UTC-5).
    const beforeFallBack = new Date('2026-11-01T05:30:00Z');
    expect(householdToday('America/Chicago', beforeFallBack)).toBe('2026-11-01');

    // Late evening in Chicago is already the next UTC day - the chore day must not roll.
    const lateEvening = new Date('2026-06-15T04:30:00Z'); // 23:30 on the 14th in Chicago
    expect(householdToday('America/Chicago', lateEvening)).toBe('2026-06-14');
  });

  it('identifies Sunday for the weekly cash-out reset', () => {
    expect(householdWeekday('America/Chicago', new Date('2026-08-16T12:00:00Z'))).toBe(0);
  });
});

describe('env loader', () => {
  it('rejects an invalid timezone', () => {
    expect(() =>
      loadEnv({ NODE_ENV: 'test', HOUSEHOLD_TZ: 'Mars/Olympus' } as NodeJS.ProcessEnv),
    ).toThrow(/not a valid IANA timezone/);
  });
});
