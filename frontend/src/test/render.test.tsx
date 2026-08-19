import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { ChoreDetail } from '../screens/child/ChoreDetail';
import { ApprovalQueue } from '../screens/parent/Approvals';
import { levelForLifetimePoints, thresholdForLevel } from '../config/levels';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('routing', () => {
  it('opens on the splash screen', () => {
    renderAt('/');
    expect(screen.getByRole('button', { name: /let's go/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select profile/i })).toBeInTheDocument();
  });

  it('lists every profile on the hero select screen', () => {
    renderAt('/profiles');
    expect(screen.getByRole('heading', { name: /choose your hero/i })).toBeInTheDocument();
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Parent 1')).toBeInTheDocument();
  });

  it('renders the child home dashboard', () => {
    renderAt('/child/home');
    expect(screen.getByText("Today's required chore")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue chore/i })).toBeInTheDocument();
  });

  it('renders the parent dashboard with both children', () => {
    renderAt('/parent');
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeInTheDocument();
    expect(screen.getByText('Pending approvals')).toBeInTheDocument();
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
    render(
      <MemoryRouter initialEntries={['/child/chore/core-kitchen']}>
        <Routes>
          <Route path="/child/chore/:choreId" element={<ChoreDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/finish every step to unlock the camera/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open camera/i })).not.toBeInTheDocument();

    for (const item of screen.getAllByRole('button', { pressed: false })) {
      if (item.className.includes('check')) await user.click(item);
    }

    expect(screen.getByRole('button', { name: /open camera/i })).toBeInTheDocument();
  });

  it('never offers a gallery upload as an alternative to the live camera', () => {
    render(
      <MemoryRouter initialEntries={['/child/chore/core-kitchen']}>
        <Routes>
          <Route path="/child/chore/:choreId" element={<ChoreDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/upload/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/choose from gallery/i)).not.toBeInTheDocument();
  });

  it('shows the parent note when a chore was rejected', () => {
    render(
      <MemoryRouter initialEntries={['/child/chore/core-bathroom']}>
        <Routes>
          <Route path="/child/chore/:choreId" element={<ChoreDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/a parent sent this back/i)).toBeInTheDocument();
    expect(screen.getByText(/mirror still has spots/i)).toBeInTheDocument();
  });
});

describe('approval queue safety rule', () => {
  it('locks Approve All until every photo has been opened', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/parent/approvals']}>
        <Routes>
          <Route path="/parent/approvals" element={<ApprovalQueue />} />
          <Route path="/parent/approvals/:submissionId" element={<div>review</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const bulk = screen.getByRole('button', { name: /approve all/i });
    expect(bulk).toBeDisabled();

    const thumbnails = screen.getAllByRole('button', { name: /view photo for/i });
    await user.click(thumbnails[0]!);
    await user.click(screen.getByRole('dialog', { name: /submitted photo/i }));
    expect(screen.getByRole('button', { name: /approve all/i })).toBeDisabled();

    for (const thumbnail of screen.getAllByRole('button', { name: /view photo for/i })) {
      await user.click(thumbnail);
      await user.click(screen.getByRole('dialog', { name: /submitted photo/i }));
    }
    expect(screen.getByRole('button', { name: /approve all/i })).toBeEnabled();
  });
});

describe('leaderboard', () => {
  it('ranks the kids only and never lists a parent', () => {
    renderAt('/child/leaderboard');
    expect(screen.getAllByText('Child 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Child 2').length).toBeGreaterThan(0);
    expect(screen.queryByText('Parent 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Parent 2')).not.toBeInTheDocument();
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
  it('labels the bottom navigation and marks the active destination', () => {
    renderAt('/child/home');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: /home/i })).toHaveClass('is-active');
  });

  it('gives every progress meter an accessible name', () => {
    renderAt('/child/home');
    for (const bar of screen.getAllByRole('progressbar')) {
      expect(bar).toHaveAccessibleName();
    }
  });
});
