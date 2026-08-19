import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

/**
 * No test may reach the network.
 *
 * Without this, AuthProvider's startup call to /api/auth/me would make a real
 * request to localhost:4000, and the suite would pass or fail depending on
 * whether the developer happened to have the backend running. Rejecting puts
 * the app in its preview mode, which is the state these screens are written to
 * be reviewed in: mock data, no server.
 *
 * A test that wants a signed-in app stubs fetch itself.
 */
/**
 * jsdom is not a secure context, and browsers only expose the camera in one.
 * Without this the chore screens would render their "needs https" explanation
 * in every test, and the checklist-gates-the-camera rule would go unchecked.
 * The test that covers the insecure case overrides this back to false.
 */
beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('fetch is disabled in tests'))),
  );
});
