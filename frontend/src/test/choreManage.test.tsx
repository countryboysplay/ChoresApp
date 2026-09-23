import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ChoreManage } from '../screens/parent/ChoreManage';

/**
 * The backend has always accepted a `subtasks` list on PATCH
 * /api/parent/chores/:choreId (chore-admin.ts). This screen just never sent
 * one, so a parent who wanted to fix a chore's checklist after creating it
 * had no way to do it. These tests cover the edit sheet reading the chore's
 * existing steps and sending an edited list back.
 */

const CHORE = {
  id: 'chore-1',
  name: 'Kitchen',
  icon: 'kitchen',
  points: 10,
  category: null,
  instructions: null,
  isActive: true,
  subtasks: [
    { id: 'sub-1', title: 'Wash dishes', instruction: null },
    { id: 'sub-2', title: 'Sweep floor', instruction: null },
  ],
  schedules: [
    {
      assignedTo: 'child-1',
      assignedToName: 'Child 1',
      recurrence: 'daily' as const,
      daysOfWeek: [],
      startsOn: '2026-01-01',
      endsOn: null,
      isActive: true,
    },
  ],
};

const MEMBERS = [
  {
    id: 'child-1',
    role: 'child' as const,
    displayName: 'Child 1',
    avatar: null,
    sortOrder: 0,
    isActive: true,
    hasPin: false,
    lastLoginAt: null,
    balance: 0,
    signedInDevices: 0,
    managedHere: true,
  },
];

function stubHousehold(patch?: { onPatchBody?: (body: unknown) => void }) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/parent/chores') && init?.method === 'PATCH') {
      patch?.onPatchBody?.(init.body ? JSON.parse(String(init.body)) : undefined);
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.includes('/api/parent/chores')) {
      return Promise.resolve(
        new Response(JSON.stringify({ chores: [CHORE] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.includes('/api/parent/members')) {
      return Promise.resolve(
        new Response(JSON.stringify({ members: MEMBERS }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.reject(new TypeError('fetch is disabled in tests'));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <ChoreManage />
    </MemoryRouter>,
  );
}

describe('editing a chore\'s steps', () => {
  it('shows a chore\'s existing steps when the edit sheet opens', async () => {
    stubHousehold();
    const user = userEvent.setup();
    renderScreen();

    const editButton = await screen.findByRole('button', { name: /edit kitchen/i });
    await user.click(editButton);

    expect(await screen.findByLabelText('Step 1')).toHaveValue('Wash dishes');
    expect(screen.getByLabelText('Step 2')).toHaveValue('Sweep floor');
  });

  it('sends an edited step list back to the server on save', async () => {
    let sentBody: { subtasks: { title: string; instruction: string | null }[] } | undefined;
    stubHousehold({ onPatchBody: (body) => (sentBody = body as typeof sentBody) });
    const user = userEvent.setup();
    renderScreen();

    const editButton = await screen.findByRole('button', { name: /edit kitchen/i });
    await user.click(editButton);

    const secondStep = await screen.findByLabelText('Step 2');
    await user.clear(secondStep);
    await user.type(secondStep, 'Mop floor');

    await user.click(screen.getByRole('button', { name: /add a step/i }));
    const thirdStep = await screen.findByLabelText('Step 3');
    await user.type(thirdStep, 'Empty trash');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await vi.waitFor(() => expect(sentBody).toBeDefined());
    expect(sentBody!.subtasks).toEqual([
      { title: 'Wash dishes', instruction: null },
      { title: 'Mop floor', instruction: null },
      { title: 'Empty trash', instruction: null },
    ]);
  });

  it('drops blank steps rather than sending them to the server', async () => {
    let sentBody: { subtasks: { title: string; instruction: string | null }[] } | undefined;
    stubHousehold({ onPatchBody: (body) => (sentBody = body as typeof sentBody) });
    const user = userEvent.setup();
    renderScreen();

    const editButton = await screen.findByRole('button', { name: /edit kitchen/i });
    await user.click(editButton);

    await user.click(await screen.findByRole('button', { name: /add a step/i }));
    // The new, empty step is left blank.

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await vi.waitFor(() => expect(sentBody).toBeDefined());
    expect(sentBody!.subtasks).toEqual([
      { title: 'Wash dishes', instruction: null },
      { title: 'Sweep floor', instruction: null },
    ]);
  });
});
