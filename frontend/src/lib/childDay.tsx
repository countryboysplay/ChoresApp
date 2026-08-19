import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ChildDayResponse, Chore } from '@chore-quest/shared';
import { api } from './api';
import { useAuth } from './auth';
import { bonusChores, children as mockChildren, coreChores, ledger } from '../mock/data';

/**
 * The child's day, from the API when there is one and from the Stage 2 mock
 * data when there is not.
 *
 * Screens read one shape either way. Without this adapter every wired screen
 * would carry its own "are we in preview mode" branch, and the GitHub Pages
 * build - which is how these screens get reviewed on a phone - would slowly
 * drift away from the real thing.
 */

interface ChildDayValue {
  day: ChildDayResponse | null;
  loading: boolean;
  error: string | null;
  /** Live in preview mode: ticking works, but only in memory. */
  setSubtaskDone: (choreId: string, subtaskId: string, done: boolean) => Promise<void>;
  reload: () => Promise<void>;
}

const ChildDayContext = createContext<ChildDayValue | null>(null);

/** Builds the API's day shape out of the mock household. */
function previewDay(): ChildDayResponse {
  const me = mockChildren[0];
  const toChore = (chore: (typeof coreChores)[number]): Chore => ({
    id: chore.id,
    name: chore.name,
    icon: chore.icon,
    kind: chore.kind,
    category: chore.category ?? null,
    status: chore.status,
    points: chore.points,
    choreDate: '2026-08-19',
    rejectionNote: chore.rejectionNote ?? null,
    expiresAt: null,
    claimed: true,
    subtasks: chore.subtasks.map((task, index) => ({
      id: task.id,
      position: index,
      title: task.title,
      instruction: task.instruction ?? null,
      done: task.done,
    })),
  });

  const win = ledger.find((entry) => entry.delta > 0);

  return {
    date: '2026-08-19',
    today: '2026-08-19',
    summary: {
      spendablePoints: me?.spendablePoints ?? 0,
      lifetimePoints: me?.lifetimePoints ?? 0,
      streakDays: me?.streakDays ?? 0,
      recentWin: win ? { label: win.label, delta: win.delta, at: new Date(0).toISOString() } : null,
    },
    core: coreChores.map(toChore),
    bonus: bonusChores.filter((chore) => chore.claimedBy).map(toChore),
    availableBonus: bonusChores.filter((chore) => !chore.claimedBy).map(toChore),
  };
}

export function ChildDayProvider({ children }: { children: ReactNode }) {
  const { mode, user } = useAuth();
  const [day, setDay] = useState<ChildDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (mode === 'loading') return;

    if (mode === 'preview') {
      setDay(previewDay());
      setLoading(false);
      return;
    }

    if (!user || user.role !== 'child') {
      setDay(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setDay(await api.chores.day());
      setError(null);
    } catch {
      setError('Could not load today. Pull to try again.');
    } finally {
      setLoading(false);
    }
  }, [mode, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setSubtaskDone = useCallback(
    async (choreId: string, subtaskId: string, done: boolean) => {
      // Optimistic. A checklist that waits for a round trip before the tick
      // appears feels broken on a phone with weak wifi.
      const applyLocally = (current: ChildDayResponse | null): ChildDayResponse | null => {
        if (!current) return current;
        const patch = (chore: Chore): Chore =>
          chore.id === choreId
            ? {
                ...chore,
                subtasks: chore.subtasks.map((task) =>
                  task.id === subtaskId ? { ...task, done } : task,
                ),
              }
            : chore;
        return { ...current, core: current.core.map(patch), bonus: current.bonus.map(patch) };
      };

      setDay(applyLocally);
      if (mode === 'preview') return;

      try {
        const { chore } = await api.chores.setSubtask(choreId, subtaskId, done);
        setDay((current) =>
          current
            ? {
                ...current,
                core: current.core.map((entry) => (entry.id === chore.id ? chore : entry)),
                bonus: current.bonus.map((entry) => (entry.id === chore.id ? chore : entry)),
              }
            : current,
        );
      } catch {
        // Put it back rather than leaving a tick the server did not accept.
        setDay(
          (current) =>
            current && {
              ...current,
              core: current.core.map((chore) =>
                chore.id === choreId
                  ? {
                      ...chore,
                      subtasks: chore.subtasks.map((task) =>
                        task.id === subtaskId ? { ...task, done: !done } : task,
                      ),
                    }
                  : chore,
              ),
            },
        );
        setError('That did not save. Check the connection and try again.');
      }
    },
    [mode],
  );

  const value = useMemo<ChildDayValue>(
    () => ({ day, loading, error, setSubtaskDone, reload }),
    [day, loading, error, setSubtaskDone, reload],
  );

  return <ChildDayContext.Provider value={value}>{children}</ChildDayContext.Provider>;
}

export function useChildDay(): ChildDayValue {
  const value = useContext(ChildDayContext);
  if (!value) throw new Error('useChildDay must be used inside a ChildDayProvider');
  return value;
}
