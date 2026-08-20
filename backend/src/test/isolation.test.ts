/**
 * The tests must never be able to reach the household's own database.
 *
 * This is a regression test for something that actually happened. Every suite
 * used to fall back to `DATABASE_URL` when `TEST_DATABASE_URL` was unset, which
 * was harmless while the laptop was a development machine. The moment it became
 * the machine serving the family, `npm test` started creating users, running
 * approve-all across the real queue, and deleting every row from `backups` -
 * against a household with a child's chore photo in it.
 *
 * Nothing was destroyed, and only by luck: the rule that a parent must see a
 * photo before a chore is approved happened to stop approve-all paying out a
 * real submission. The backup log was cleared, which then made the nightly job
 * take duplicate backups because the record it looks for had gone.
 *
 * A comment saying "don't do that" would not have caught it. This does.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));

async function testSources(): Promise<{ name: string; body: string }[]> {
  const names = (await readdir(testDir)).filter((name) => name.endsWith('.test.ts'));
  return Promise.all(
    names.map(async (name) => ({ name, body: await readFile(join(testDir, name), 'utf8') })),
  );
}

describe('test isolation', () => {
  it('has no suite reading DATABASE_URL directly', async () => {
    const offenders = (await testSources())
      .filter(({ body }) => /process\.env\.DATABASE_URL/.test(body))
      .map(({ name }) => name);

    // The fallback is the whole danger. A suite that reads DATABASE_URL at all
    // is one restart of a laptop away from writing to a real household.
    expect(offenders).toEqual([]);
  });

  it('routes every suite through the guarded connection string', async () => {
    const sources = await testSources();

    for (const { name, body } of sources) {
      // A suite that opens a pool must have got its connection from the guard.
      if (!/new pg\.Pool|connectionString/.test(body)) continue;
      if (name === 'isolation.test.ts') continue;

      expect(
        body.includes("from './database.js'"),
        `${name} opens a database connection without importing the guard`,
      ).toBe(true);
    }
  });

  it('skips rather than inventing a database when there is none', async () => {
    const { hasTestDatabase, testConnectionString } = await import('./database.js');

    // Whatever this machine has, the two must agree - the guard never
    // substitutes something else when TEST_DATABASE_URL is missing.
    expect(hasTestDatabase).toBe(Boolean(testConnectionString));
    if (!process.env.TEST_DATABASE_URL) {
      expect(testConnectionString).toBeUndefined();
    }
  });
});
