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
  },
});
