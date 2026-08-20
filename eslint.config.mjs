import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['backend/**/*.ts', 'scripts/**/*.mjs', '**/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Console output is the interface of a script or a CLI, not a stray debug
    // statement someone forgot to remove.
    files: ['scripts/**/*.mjs', 'backend/src/cli/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // The service worker runs in its own global scope, where `self` is the
    // registration rather than a window. It moved from public/ into src/ in
    // Stage 14 so the build can inject the precache manifest into it, which is
    // also why it is plain JS with a bundler pass rather than served as-is.
    files: ['frontend/src/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // These scripts drive a real browser. Callbacks passed to page.evaluate()
    // are serialized and run in the page, so they legitimately reference
    // document and window even though the file itself executes under Node.
    files: ['scripts/screenshots.mjs', 'scripts/generate-icons.mjs', 'scripts/review-sheet.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
