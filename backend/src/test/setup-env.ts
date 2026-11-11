/**
 * Runs before any test file imports the app.
 *
 * The app's pool (db.ts) reads DATABASE_URL once, from process.env, and
 * env.ts fills process.env from backend/.env - which on a real machine points
 * at the household's database. dotenv never overwrites a variable that is
 * already set, so pinning DATABASE_URL here means the app under test can only
 * ever reach TEST_DATABASE_URL, or no database at all (empty = not configured).
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
