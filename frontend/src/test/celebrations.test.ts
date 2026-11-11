import { beforeEach, describe, expect, it } from 'vitest';
import type { LedgerEntry } from '@chore-quest/shared';
import { celebrated } from '../components/Celebration';
import { approvalMoments, levelMoments, streakMoments } from '../screens/child/celebrations';

const paid = (id: string, delta: number, boostXp = 0): LedgerEntry => ({
  id,
  delta,
  reason: 'chore_approved',
  label: `Chore ${id}`,
  at: '2026-11-10T20:00:00Z',
  boostXp,
});

beforeEach(() => localStorage.clear());

describe('celebration rules', () => {
  it('records a level on first sight, then celebrates only a real level gain, once', () => {
    expect(levelMoments('kid', 30)).toEqual([]); // first visit: baseline only
    expect(levelMoments('kid', 50)).toEqual([]); // still level 1
    const [up] = levelMoments('kid', 70); // level 2 starts at 60
    expect(up?.kind).toBe('level-up');
    up?.done?.();
    expect(levelMoments('kid', 70)).toEqual([]);
  });

  it('does not bury an existing account in old approvals', () => {
    expect(approvalMoments('kid', [paid('a', 10), paid('b', 20)])).toEqual([]);
    const [fresh] = approvalMoments('kid', [paid('a', 10), paid('b', 20), paid('c', 15, 15)]);
    expect(fresh?.title).toBe('Chore c');
    celebrated.mark(fresh!.key);
    expect(approvalMoments('kid', [paid('a', 10), paid('b', 20), paid('c', 15, 15)])).toEqual([]);
  });

  it('celebrates a streak milestone when it is crossed, not on first sight', () => {
    expect(streakMoments('kid', 8, '2026-11-10')).toEqual([]);
    expect(streakMoments('kid', 9, '2026-11-11')).toEqual([]);
    expect(streakMoments('kid', 14, '2026-11-16')[0]?.title).toBe('14-day streak');
  });
});
