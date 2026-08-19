import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PushSetup } from '../components/PushSetup';

/**
 * The push panel is mostly a set of refusals, and each one has to say the right
 * thing. "Your browser cannot do this", "this address is not https", and "the
 * laptop has no keys yet" are three different problems with three different
 * fixes, and offering the same dead switch for all of them is how somebody ends
 * up believing the app is broken.
 *
 * jsdom has no service worker, which makes the unsupported case the free one
 * and every other case something to build up to.
 */

function stubBrowserPush(): void {
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
  Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration: vi.fn().mockResolvedValue(undefined), register: vi.fn() },
    configurable: true,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Leave the navigator as jsdom had it, or the next file inherits a browser
  // that claims to support push.
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'PushManager');
});

describe('the push panel', () => {
  it('explains itself rather than offering a switch a browser cannot honor', async () => {
    render(
      <MemoryRouter>
        <PushSetup />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Not available')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /turn on/i })).not.toBeInTheDocument();
  });

  it('blames the address, not the household, when the page is not secure', async () => {
    stubBrowserPush();
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });

    render(
      <MemoryRouter>
        <PushSetup />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Needs https')).toBeInTheDocument();
    // The same rule as the camera, and the message has to name it, because
    // opening the app by the laptop's wifi address is the common way in.
    expect(screen.getByText(/https or on the laptop itself/i)).toBeInTheDocument();
  });

  it('says the laptop has no keys yet, and how to fix it', async () => {
    stubBrowserPush();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ configured: false, publicKey: null }),
        }),
      ),
    );

    render(
      <MemoryRouter>
        <PushSetup />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Not set up')).toBeInTheDocument();
    expect(screen.getByText(/npm run vapid/)).toBeInTheDocument();
    // The point of the sentence: nothing is lost while push is off.
    expect(screen.getByText(/arrive in the inbox/i)).toBeInTheDocument();
  });

  it('offers the switch once the household has keys and nothing is subscribed', async () => {
    stubBrowserPush();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ configured: true, publicKey: 'a-public-key' }),
        }),
      ),
    );
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: vi
          .fn()
          .mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } }),
        register: vi.fn(),
      },
      configurable: true,
    });

    render(
      <MemoryRouter>
        <PushSetup />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: /turn on reminders/i })).toBeInTheDocument();
    // The promise the panel makes, and the one the backend keeps.
    expect(screen.getByText(/nothing else buzzes/i)).toBeInTheDocument();
  });

  it('does not offer to ask again once the browser has said no', async () => {
    stubBrowserPush();
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ configured: true, publicKey: 'a-public-key' }),
        }),
      ),
    );

    render(
      <MemoryRouter>
        <PushSetup />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Blocked')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
