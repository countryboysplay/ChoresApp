import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { App } from '../App';
import { AuthProvider } from '../lib/auth';
import { ChildDayProvider } from '../lib/childDay';
import { ChoreDetail } from '../screens/child/ChoreDetail';
import { ApprovalQueue } from '../screens/parent/Approvals';
import { levelForLifetimePoints, thresholdForLevel } from '../config/levels';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

/**
 * Renders one screen on its own route, with the providers the app would supply.
 * fetch is stubbed to reject in setup.ts, so auth settles into preview mode and
 * the screens read the Stage 2 mock day.
 */
function renderScreen(path: string, routes: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <ChildDayProvider>
          <Routes>{routes}</Routes>
        </ChildDayProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('routing', () => {
  it('opens on the splash screen', () => {
    renderAt('/');
    expect(screen.getByRole('button', { name: /let's go/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select profile/i })).toBeInTheDocument();
  });

  it('lists every profile on the hero select screen', async () => {
    renderAt('/profiles');
    expect(screen.getByRole('heading', { name: /choose your hero/i })).toBeInTheDocument();
    // Awaited: the profile list arrives after AuthProvider has worked out
    // whether there is a server to ask.
    expect(await screen.findByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Parent 1')).toBeInTheDocument();
  });

  it('renders the child home dashboard', async () => {
    renderAt('/child/home');
    // The day is fetched, so the screen paints a loading state first.
    expect(await screen.findByText("Today's required chore")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue chore/i })).toBeInTheDocument();
  });

  it('shows the parent dashboard once its data arrives', async () => {
    // The dashboard reads real household data now, so the screen is exercised
    // against a stubbed response rather than the Stage 2 mock module.
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes('/api/parent/dashboard')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                today: '2026-08-19',
                weekStart: '2026-08-17',
                children: [
                  { id: 'a', displayName: 'Child 1', avatar: null, balance: 240, weekPoints: 84 },
                  { id: 'b', displayName: 'Child 2', avatar: null, balance: 95, weekPoints: 62 },
                ],
                counts: {
                  pendingApprovals: 3,
                  pendingRewardRequests: 1,
                  choresDoneThisWeek: 7,
                  choresDueThisWeek: 14,
                },
                needsAttention: [],
                weekActivity: [],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.reject(new TypeError('fetch is disabled in tests'));
      }),
    );

    renderAt('/parent');
    expect(await screen.findByRole('heading', { name: 'Needs attention' })).toBeInTheDocument();
    expect(screen.getByText('Waiting for review')).toBeInTheDocument();
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();
  });

  it('shows a not-found screen for unknown routes', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: /does not exist/i })).toBeInTheDocument();
  });
});

describe('chore completion flow', () => {
  it('keeps the camera locked until every subtask is checked', async () => {
    const user = userEvent.setup();
    renderScreen(
      '/child/chore/core-kitchen',
      <Route path="/child/chore/:choreId" element={<ChoreDetail />} />,
    );

    expect(await screen.findByText(/finish every step to unlock the camera/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open camera/i })).not.toBeInTheDocument();

    for (const item of screen.getAllByRole('button', { pressed: false })) {
      if (item.className.includes('check')) await user.click(item);
    }

    expect(screen.getByRole('button', { name: /open camera/i })).toBeInTheDocument();
  });

  it('never offers a gallery upload as an alternative to the live camera', async () => {
    renderScreen(
      '/child/chore/core-kitchen',
      <Route path="/child/chore/:choreId" element={<ChoreDetail />} />,
    );
    await screen.findByText(/checklist/i);
    expect(screen.queryByText(/upload/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /choose file/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/choose from gallery/i)).not.toBeInTheDocument();
  });

  it('explains itself instead of offering a camera that cannot work', async () => {
    // Reaching the dev server at http://192.168.x.x over house wifi is not a
    // secure context, so getUserMedia is simply absent. The screen has to say
    // why rather than presenting a button that fails on tap.
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const user = userEvent.setup();
    renderScreen(
      '/child/chore/core-kitchen',
      <Route path="/child/chore/:choreId" element={<ChoreDetail />} />,
    );

    await screen.findByText(/finish every step to unlock the camera/i);
    for (const item of screen.getAllByRole('button', { pressed: false })) {
      if (item.className.includes('check')) await user.click(item);
    }

    expect(await screen.findByText(/needs a secure connection/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open camera/i })).not.toBeInTheDocument();
  });

  it('shows the parent note when a chore was rejected', async () => {
    renderScreen(
      '/child/chore/core-bathroom',
      <Route path="/child/chore/:choreId" element={<ChoreDetail />} />,
    );
    expect(await screen.findByText(/a parent sent this back/i)).toBeInTheDocument();
    expect(screen.getByText(/mirror still has spots/i)).toBeInTheDocument();
  });
});

describe('approval queue safety rule', () => {
  /** One pending submission, with control over whether its photo was opened. */
  function queueWith(photosViewed: boolean[]) {
    return {
      pending: photosViewed.map((viewed, index) => ({
        id: `sub-${index}`,
        status: 'submitted',
        choreDate: '2026-08-19',
        choreName: `Chore ${index + 1}`,
        choreIcon: 'kitchen',
        choreKind: 'core',
        child: { id: `child-${index}`, displayName: `Child ${index + 1}`, avatar: null },
        submittedAt: new Date().toISOString(),
        reviewedAt: null,
        pointsValue: 10,
        pointsAwarded: null,
        punctual: false,
        rejectionNote: null,
        subtasksTotal: 3,
        subtasksDone: 3,
        photos: [{ id: `photo-${index}`, viewed }],
      })),
      reviewed: [],
    };
  }

  function stubQueue(queue: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/parent/approvals')) {
          return Promise.resolve(
            new Response(JSON.stringify(queue), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        // Everything else, including the auth check, stays offline.
        return Promise.reject(new TypeError('fetch is disabled in tests'));
      }),
    );
  }

  it('locks Approve All while any photo is still unopened', async () => {
    // The specification's guard against rubber-stamping work nobody looked at.
    // Whether a photo has been opened is decided by the server - loading it is
    // what marks it seen - so the screen reads that state rather than tracking
    // its own clicks.
    stubQueue(queueWith([true, false]));
    renderScreen('/parent/approvals', <Route path="/parent/approvals" element={<ApprovalQueue />} />);

    expect(await screen.findByRole('button', { name: /approve all/i })).toBeDisabled();
    expect(screen.getByText(/open every photo before approving/i)).toBeInTheDocument();
  });

  it('unlocks it once every photo has been opened', async () => {
    stubQueue(queueWith([true, true]));
    renderScreen('/parent/approvals', <Route path="/parent/approvals" element={<ApprovalQueue />} />);

    expect(await screen.findByRole('button', { name: /approve all/i })).toBeEnabled();
  });

  it('offers nothing to approve when the queue is empty', async () => {
    stubQueue({ pending: [], reviewed: [] });
    renderScreen('/parent/approvals', <Route path="/parent/approvals" element={<ApprovalQueue />} />);

    expect(await screen.findByText(/nothing waiting/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve all/i })).not.toBeInTheDocument();
  });
});

describe('leaderboard', () => {
  it('ranks the kids only and never lists a parent', async () => {
    // The board reads the household now rather than the Stage 2 mock module, so
    // this asserts against a stubbed response. The guarantee it guards has not
    // moved: the endpoint selects role = 'child', and no parent name reaches
    // this screen to be rendered.
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes('/api/child/leaderboard')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                entries: [
                  {
                    id: 'a',
                    displayName: 'Child 1',
                    avatar: null,
                    lifetimePoints: 240,
                    weekPoints: 84,
                    streakDays: 5,
                    choresApproved: 12,
                  },
                  {
                    id: 'b',
                    displayName: 'Child 2',
                    avatar: null,
                    lifetimePoints: 95,
                    weekPoints: 62,
                    streakDays: 2,
                    choresApproved: 6,
                  },
                ],
                meId: 'a',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.reject(new TypeError('fetch is disabled in tests'));
      }),
    );

    renderAt('/child/leaderboard');
    expect((await screen.findAllByText('Child 1')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Child 2').length).toBeGreaterThan(0);
    expect(screen.queryByText('Parent 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Parent 2')).not.toBeInTheDocument();
  });

  it('ranks by the range on show, so first place always holds the bigger number', async () => {
    // Child 2 has the better week and the worse lifetime. Ordering by lifetime
    // while the pill showed this week's total put the larger number in second
    // place, which is the sort of thing a child spots immediately.
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes('/api/child/leaderboard')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                entries: [
                  {
                    id: 'a',
                    displayName: 'Child 1',
                    avatar: null,
                    lifetimePoints: 900,
                    weekPoints: 10,
                    streakDays: 1,
                    choresApproved: 40,
                  },
                  {
                    id: 'b',
                    displayName: 'Child 2',
                    avatar: null,
                    lifetimePoints: 100,
                    weekPoints: 300,
                    streakDays: 1,
                    choresApproved: 5,
                  },
                ],
                meId: 'b',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.reject(new TypeError('fetch is disabled in tests'));
      }),
    );

    renderAt('/child/leaderboard');
    // The ranked list, not the podium: the podium deliberately draws second
    // place first so the winner stands in the middle, so its DOM order is not
    // rank order.
    await screen.findAllByText(/Child 2/);
    const rows = screen.getAllByRole('article');
    expect(rows[0]!.textContent).toContain('Child 2');
    expect(rows[1]!.textContent).toContain('Child 1');
  });
});

describe('level curve', () => {
  it('requires progressively more points for each level', () => {
    const gaps = [2, 3, 4, 5, 6].map((level) => thresholdForLevel(level) - thresholdForLevel(level - 1));
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i]!).toBeGreaterThan(gaps[i - 1]!);
    }
  });

  it('places lifetime points inside the right level band', () => {
    const progress = levelForLifetimePoints(1310);
    expect(progress.level).toBeGreaterThan(1);
    expect(progress.currentLevelAt).toBeLessThanOrEqual(1310);
    expect(progress.nextLevelAt).toBeGreaterThan(1310);
    expect(progress.pointsIntoLevel).toBe(1310 - progress.currentLevelAt);
  });

  it('starts everyone at level 1 with zero points', () => {
    expect(levelForLifetimePoints(0).level).toBe(1);
  });
});

describe('accessibility basics', () => {
  it('labels the bottom navigation and marks the active destination', async () => {
    renderAt('/child/home');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: /home/i })).toHaveClass('is-active');
  });

  it('gives every progress meter an accessible name', async () => {
    renderAt('/child/home');
    for (const bar of await screen.findAllByRole('progressbar')) {
      expect(bar).toHaveAccessibleName();
    }
  });
});
