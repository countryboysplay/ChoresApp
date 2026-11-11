import { describe, expect, it } from 'vitest';
import type { ChoreDefinition, RewardItem } from '@chore-quest/shared';
import { rankForLevel } from '../config/levels';
import { levelTier } from '../design/neon';
import { filterChores } from '../screens/parent/ChoreManage';
import { arrangeRewards } from '../screens/parent/RewardManage';
import { filterRewards } from '../screens/child/Rewards';
import { questTab } from '../screens/child/Missions';

describe('rankForLevel', () => {
  it('names each ten-level band to match its tier emblem', () => {
    const cases: [number, string, string][] = [
      [1, 'Bronze', 'level-tier-1'],
      [9, 'Bronze', 'level-tier-1'],
      [10, 'Silver', 'level-tier-2'],
      [29, 'Gold', 'level-tier-3'],
      [30, 'Platinum', 'level-tier-4'],
      [40, 'Diamond', 'level-tier-5'],
      [50, 'Diamond', 'level-tier-5'],
    ];
    for (const [level, rank, tier] of cases) {
      expect(rankForLevel(level)).toBe(rank);
      expect(levelTier(level)).toBe(tier);
    }
  });
});

const chore = (id: string, name: string, kids: string[], isActive = true) =>
  ({ id, name, isActive, schedules: kids.map((assignedTo) => ({ assignedTo })) }) as unknown as ChoreDefinition;

describe('filterChores', () => {
  const list = [chore('a', 'Kitchen Reset', ['k1']), chore('b', 'Laundry', ['k2']), chore('c', 'Old kitchen', ['k1'], false)];
  it('searches by name, filters by child and by active state', () => {
    expect(filterChores(list, 'KITCHEN', '', 'all').map((c) => c.id)).toEqual(['a', 'c']);
    expect(filterChores(list, '', 'k2', 'all').map((c) => c.id)).toEqual(['b']);
    expect(filterChores(list, 'kitchen', 'k1', 'active').map((c) => c.id)).toEqual(['a']);
    expect(filterChores(list, '', '', 'retired').map((c) => c.id)).toEqual(['c']);
  });
});

describe('arrangeRewards', () => {
  const list = [
    { name: 'Pizza', category: 'Food', cost: 250 },
    { name: 'Gaming hour', category: 'Screen time', cost: 100 },
    { name: 'Stay up late', category: 'Privileges', cost: 150 },
  ];
  it('searches name or category and sorts by cost without touching the input', () => {
    expect(arrangeRewards(list, 'screen', 'default').map((r) => r.name)).toEqual(['Gaming hour']);
    expect(arrangeRewards(list, '', 'cost-asc').map((r) => r.cost)).toEqual([100, 150, 250]);
    expect(arrangeRewards(list, '', 'cost-desc').map((r) => r.cost)).toEqual([250, 150, 100]);
    expect(list[0]?.name).toBe('Pizza');
  });
});

describe('filterRewards (kid)', () => {
  const r = (id: string, category: string, cost: number, extra: Partial<RewardItem> = {}) =>
    ({ id, category, cost, lockedUntil: null, isFavorite: false, isPrimaryGoal: false, ...extra }) as RewardItem;
  const list = [r('a', 'Gaming', 50), r('b', 'Gaming', 500, { isPrimaryGoal: true }), r('c', 'Activities', 40, { lockedUntil: '2026-12-01' })];
  it('combines the category chip with the Available/Goals tab', () => {
    expect(filterRewards(list, 'All', 'All', 100).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(filterRewards(list, 'Gaming', 'Available', 100).map((x) => x.id)).toEqual(['a']);
    expect(filterRewards(list, 'Gaming', 'Goals', 100).map((x) => x.id)).toEqual(['b']);
    expect(filterRewards(list, 'Activities', 'Available', 100)).toEqual([]);
  });
});

describe('questTab', () => {
  it('buckets every status', () => {
    expect(questTab('not_started')).toBe('To do');
    expect(questTab('rejected')).toBe('To do');
    expect(questTab('in_progress')).toBe('In progress');
    expect(questTab('submitted')).toBe('In progress');
    expect(questTab('approved')).toBe('Done');
    expect(questTab('excused')).toBe('Done');
  });
});
