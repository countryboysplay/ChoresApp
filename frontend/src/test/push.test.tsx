import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PushSetup } from '../components/PushSetup';
import { ChildReminders } from '../components/ChildReminders';

/**
 * Reminders are not optional for a child, and the app cannot enforce that.
 *
 * Notification permission belongs to whoever is holding the phone: Chrome will
 * not let a site grant itself permission, and its settings can always take it
 * back. So the rule is kept the only way it can be - the child panel offers no
 * off switch and turns itself on unprompted, and the parent panel makes a phone
 * that has gone quiet visible. Both halves are worth a test, because either one
 * alone is a rule that quietly does not hold.
 *
 * jsdom has no service worker, which makes "unsupported" the free case and
 * every other one something to build up to.
 */

function stubBrowserPush(options: { permission?: NotificationPermission; subscribed?: boolean } = {}) {
  const subscribe = vi.fn().mockResolvedValue({
    endpoint: 'https://push.example.com/subscription/test',
    toJSON: () => ({
      endpoint: 'https://push.example.com/subscription/test',
      keys: { p256dh: 'a', auth: 'b' },
    }),
  });
  const existing = options.subscribed
    ? {
        endpoint: 'https://push.example.com/subscription/test',
        toJSON: () => ({
          endpoint: 'https://push.example.com/subscription/test',
          keys: { p256dh: 'a', auth: 'b' },
        }),
      }
    : null;

  const requestPermission = vi.fn().mockResolvedValue(options.permission ?? 'granted');
  vi.stubGlobal('Notification', {
    permission: options.permission ?? 'default',
    requestPermission,
  });
  Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      getRegistration: vi.fn().mockResolvedValue({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(existing),
          subscribe,
        },
      }),
      register: vi.fn(),
    },
    configurable: true,
  });
  return { requestPermission, subscribe };
}

/** A server with push configured, answering both calls the panel makes. */
function stubConfiguredServer() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            String(url).includes('/api/push/key')
              ? { configured: true, publicKey: 'a-public-key' }
              : { ok: true, configured: true },
          ),
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Leave the navigator as jsdom had it, or the next file inherits a browser
  // that claims to support push.
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'PushManager');
});

describe('the child push panel', () => {
  it('explains itself rather than offering a switch a browser cannot honor', async () => {
    render(
      <MemoryRouter>
        <PushSetup />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Not available')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
    // The same rule as the camera, and the message names it, because opening
    // the app by the laptop's wifi address is the common way in.
    expect(screen.getByText(/https or on the laptop itself/i)).toBeInTheDocument();
  });

  it('says nothing is lost while the laptop has no keys', async () => {
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
    // The reassurance that matters to a child: the reminder still arrives.
    expect(screen.getByText(/inbox/i)).toBeInTheDocument();
  });

  it('turns reminders on without being asked', async () => {
    const { requestPermission, subscribe } = stubBrowserPush({ permission: 'granted' });
    stubConfiguredServer();

    render(
      <MemoryRouter>
        <PushSetup />
      </MemoryRouter>,
    );

    // The whole point: nobody tapped anything.
    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    await waitFor(() => expect(subscribe).toHaveBeenCalled());
    expect(await screen.findByText('On')).toBeInTheDocument();
  });

  it('never offers a child a way to turn reminders off', async () => {
    stubBrowserPush({ permission: 'granted', subscribed: true });
    stubConfiguredServer();

    render(
      <MemoryRouter>
        <PushSetup />
      </MemoryRouter>,
    );

    expect(await screen.findByText('On')).toBeInTheDocument();
    // Owner decision. The browser still has one, which is why the parent side
    // reports a phone that has gone quiet.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not offer to ask again once the browser has said no', async () => {
    stubBrowserPush({ permission: 'denied' });
    stubConfiguredServer();

    render(
      <MemoryRouter>
        <PushSetup />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Blocked')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // A child should know this is visible, rather than discovering it is not.
    expect(screen.getByText(/grown-up can see/i)).toBeInTheDocument();
  });
});

describe('the parent reminder panel', () => {
  function stubChildren(children: unknown[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ configured: true, children }),
        }),
      ),
    );
  }

  it('names a child whose phone is not being reached', async () => {
    stubChildren([
      { id: '1', displayName: 'Reachable', devices: 1, mutedByParent: false, remindersReaching: true },
      { id: '2', displayName: 'Silent', devices: 0, mutedByParent: false, remindersReaching: false },
    ]);

    render(
      <MemoryRouter>
        <ChildReminders />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Silent')).toBeInTheDocument();
    expect(screen.getByText('Not reaching')).toBeInTheDocument();
    expect(screen.getByText('1 not reaching')).toBeInTheDocument();
    // The honest sentence. Pretending the app could prevent it would be worse
    // than saying plainly that it cannot.
    expect(screen.getByText(/cannot stop that being done/i)).toBeInTheDocument();
  });

  it('says nothing alarming when every child is reachable', async () => {
    stubChildren([
      { id: '1', displayName: 'Reachable', devices: 2, mutedByParent: false, remindersReaching: true },
    ]);

    render(
      <MemoryRouter>
        <ChildReminders />
      </MemoryRouter>,
    );

    expect(await screen.findByText('On, 2 phones')).toBeInTheDocument();
    expect(screen.queryByText(/not reaching/i)).not.toBeInTheDocument();
  });

  it('shows a muted child as muted rather than as a problem', async () => {
    stubChildren([
      { id: '1', displayName: 'Away', devices: 1, mutedByParent: true, remindersReaching: false },
    ]);

    render(
      <MemoryRouter>
        <ChildReminders />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Muted by you')).toBeInTheDocument();
    // A deliberate choice is not a warning, so the count stays silent.
    expect(screen.queryByText(/1 not reaching/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
  });
});
