import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../lib/auth';
import { RequireRole } from '../components/RequireRole';

/**
 * An unreachable server must not be a way into the app.
 *
 * Until Stage 14 the app fell into preview mode whenever a request failed,
 * which let navigation through and showed mock profiles. That was harmless only
 * because an app with no cached shell does not open at all without a server.
 * Caching the shell removes the accident: the app now opens offline, so a
 * runtime fallback would mean anybody who can make the API unreachable - pull
 * the wifi, wait for the laptop to sleep, and after the Stage 16 tunnel, from
 * outside the house - is inside the app with no PIN.
 *
 * These tests exist to make that regression loud. `fetch` is already stubbed to
 * reject in setup.ts, so every case here is a server that cannot be reached;
 * the only variable is whether this is the Pages demo build.
 */

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/child/home']}>
      <AuthProvider>
        <Routes>
          <Route element={<RequireRole role="child" />}>
            <Route path="/child/home" element={<p>the child home screen</p>} />
          </Route>
          <Route path="/profiles" element={<p>the profile picker</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a real build with no server', () => {
  it('does not let anyone past the guard', async () => {
    vi.stubEnv('VITE_PREVIEW_MODE', 'false');

    renderGuarded();

    expect(await screen.findByText(/can.t reach home/i)).toBeInTheDocument();
    // The actual regression being pinned shut.
    expect(screen.queryByText('the child home screen')).not.toBeInTheDocument();
  });

  it('says it cannot reach home rather than pretending to load forever', async () => {
    vi.stubEnv('VITE_PREVIEW_MODE', 'false');

    renderGuarded();

    expect(await screen.findByText(/can.t reach home/i)).toBeInTheDocument();
    // The reassurance a child needs: nothing they did has been lost.
    expect(screen.getByText(/nothing is lost/i)).toBeInTheDocument();
  });

  it('shows no mock household, because there is no household to show', async () => {
    vi.stubEnv('VITE_PREVIEW_MODE', 'false');

    renderGuarded();

    await screen.findByText(/can.t reach home/i);
    // The Stage 2 placeholders must not surface in a real build, offline or not.
    expect(screen.queryByText(/child 1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/parent 1/i)).not.toBeInTheDocument();
  });
});

describe('the Pages demo build with no server', () => {
  it('still walks through, because that is the whole point of it', async () => {
    vi.stubEnv('VITE_PREVIEW_MODE', 'true');

    renderGuarded();

    // No backend is ever deployed alongside it, so a guard here would leave the
    // design review stuck on a login that can never succeed.
    expect(await screen.findByText('the child home screen')).toBeInTheDocument();
  });
});
