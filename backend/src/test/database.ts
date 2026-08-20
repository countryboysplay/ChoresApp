/**
 * Which database the tests are allowed to touch.
 *
 * Every test file used to fall back to `DATABASE_URL` when `TEST_DATABASE_URL`
 * was unset. That was harmless while the laptop was a development machine and
 * stopped being harmless the moment it became the one serving the household:
 * `npm test` then created users, inserted chores, ran approve-all across the
 * whole queue, and deleted every row from `backups` - against the family's real
 * data.
 *
 * That is not hypothetical. It happened during Stage 17, and it left three
 * backup folders on disk with one row describing them, which in turn made the
 * nightly job take duplicate backups because the record it looks for was gone.
 * Nothing was destroyed, but only because the rule that a photo must be seen
 * before a chore is approved happened to stop approve-all paying out a child's
 * real submission.
 *
 * So there is no fallback any more. Tests run against `TEST_DATABASE_URL` or
 * they skip, and they refuse outright to run against the household database
 * even if somebody points the two at the same place.
 */

const testUrl = process.env.TEST_DATABASE_URL;
const liveUrl = process.env.DATABASE_URL;

/** The database name out of a connection string, for the guard below. */
function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

/*
 * Removing the fallback above is what actually prevents the accident. This is a
 * second check for the deliberate-looking mistake: pointing TEST_DATABASE_URL
 * at the same place as DATABASE_URL.
 *
 * CI legitimately does exactly that - it migrates a scratch database through
 * DATABASE_URL and then tests it - so equality alone cannot be the rule. What
 * distinguishes the two cases is the name: a database somebody called
 * `chore_quest_test` is one they expect to be written to and thrown away.
 */
if (testUrl && liveUrl && testUrl === liveUrl && !/test/i.test(databaseName(testUrl))) {
  throw new Error(
    `TEST_DATABASE_URL points at "${databaseName(testUrl)}", the same database the app serves ` +
      'from. The tests would create users, approve chores, and clear the backup log against ' +
      'a real household. Point it at a separate database with "test" in the name.',
  );
}

/**
 * The connection string tests may use, or null when there is none.
 *
 * Null means skip, exactly as an absent database always has. It never means
 * "use the other one".
 */
export const testConnectionString: string | undefined = testUrl;

/** True when the suite has a database of its own to work in. */
export const hasTestDatabase = Boolean(testConnectionString);
