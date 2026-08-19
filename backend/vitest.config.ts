import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Explicit, because the default changed underneath us. vitest 2 ignored
    // dist; vitest 4 collected dist/test/*.test.js as well, so every suite ran
    // twice - once from source and once from whatever the last build happened
    // to emit. A stale compiled copy passing while the source fails is the
    // failure mode that would have been genuinely hard to spot.
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],

    // One file at a time. Every suite here talks to the same Postgres database,
    // and some of what they exercise is household-wide by design: there is a
    // single household_settings row, and the reminder sweep deliberately tells
    // every parent about every child. Run in parallel, one file's chores put
    // notifications in another file's inboxes and one file's settings change
    // the times another file is asserting against.
    //
    // The alternative is a database per worker, which is worth doing if the
    // suite ever gets slow enough to care. At a few seconds, it is not.
    fileParallelism: false,
  },
});
