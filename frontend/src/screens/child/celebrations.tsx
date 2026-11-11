/**
 * Which moments to celebrate on the kid screens, and the queue that plays them
 * one at a time. Each shows once per device (see components/Celebration).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AchievementItem, LedgerEntry, Redemption } from '@chore-quest/shared';
import { Icon } from '../../design/icons';
import { BadgeArt, NeonArt, rewardArt } from '../../design/neon';
import { Celebration, CelebrationStats, type CelebrationKind } from '../../components/Celebration';
import { celebrated, deviceMemory } from '../../lib/deviceMemory';
import { levelForLifetimePoints } from '../../config/levels';
import { TierEmblem } from './choreStatus';

export interface Moment {
  key: string;
  kind: CelebrationKind;
  title: string;
  art?: ReactNode;
  body?: ReactNode;
  /** Further keys this one moment covers (several approvals shown as one). */
  alsoMarks?: string[];
  /** Runs once the player closes it. */
  done?: () => void;
}

const ORDER: CelebrationKind[] = ['chore-approved', 'level-up', 'streak-milestone', 'badge-unlocked', 'reward-unlocked'];

/** Plays pending moments one at a time, each once per device. `onIdle` says whether one is showing. */
export function CelebrationQueue({ moments, onIdle }: { moments: Moment[]; onIdle?: (idle: boolean) => void }) {
  const [closed, setClosed] = useState<string[]>([]);
  const next = [...moments]
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .find((moment) => !closed.includes(moment.key) && !celebrated.has(moment.key));

  // Celebration re-runs its effect (and its sound) when onClose changes identity.
  const current = useRef(next);
  current.current = next;
  const close = useCallback(() => {
    const moment = current.current;
    if (!moment) return;
    [moment.key, ...(moment.alsoMarks ?? [])].forEach((key) => celebrated.mark(key));
    moment.done?.();
    setClosed((list) => [...list, moment.key]);
  }, []);

  const idle = !next;
  useEffect(() => onIdle?.(idle), [idle, onIdle]);

  if (!next) return null;
  return (
    <Celebration key={next.key} kind={next.kind} title={next.title} art={next.art} onClose={close}>
      {next.body}
    </Celebration>
  );
}

/** Adds moments to a list, skipping keys it already holds. */
export function mergeMoments(list: Moment[], more: Moment[]): Moment[] {
  const fresh = more.filter((moment) => !list.some((held) => held.key === moment.key));
  return fresh.length ? [...list, ...fresh] : list;
}

/** A stored number per player, for "higher than last time" checks. */
const remember = {
  get(key: string): number | null {
    const value = deviceMemory.get(`cq-kid:${key}`);
    return value == null ? null : Number(value);
  },
  set(key: string, value: number): void {
    deviceMemory.set(`cq-kid:${key}`, String(value));
  },
};

/**
 * First sight of a list on this device just records it, so an existing account
 * is not buried in celebrations for everything it already had.
 */
function unseen(scope: string, keys: string[]): Set<string> {
  const seed = `seed:${scope}`;
  if (!celebrated.has(seed)) {
    keys.forEach((key) => celebrated.mark(key));
    celebrated.mark(seed);
    return new Set();
  }
  return new Set(keys.filter((key) => !celebrated.has(key)));
}

export function levelMoments(userId: string, lifetimePoints: number): Moment[] {
  const store = `xp:${userId}`;
  const before = remember.get(store);
  const level = levelForLifetimePoints(lifetimePoints).level;
  if (before === null || level <= levelForLifetimePoints(before).level) {
    remember.set(store, lifetimePoints);
    return [];
  }
  const progress = levelForLifetimePoints(lifetimePoints);
  return [
    {
      key: `level:${userId}:${level}`,
      kind: 'level-up',
      title: `Level ${level} unlocked`,
      art: <TierEmblem level={level} size={190} />,
      body: (
        <>
          <CelebrationStats xp={lifetimePoints - before} />
          {progress.nextLevelAt !== null && (
            <p style={{ margin: 0 }}>
              {(progress.nextLevelAt - lifetimePoints).toLocaleString('en-US')} XP to level {level + 1}
            </p>
          )}
        </>
      ),
      done: () => remember.set(store, lifetimePoints),
    },
  ];
}

const STREAKS = [30, 14, 7, 3];

export function streakMoments(userId: string, streak: number, today: string): Moment[] {
  const store = `streak:${userId}`;
  const before = remember.get(store);
  const milestone = before === null ? undefined : STREAKS.find((n) => streak >= n && before < n);
  if (!milestone) {
    remember.set(store, streak);
    return [];
  }
  const nextGoal = [...STREAKS].reverse().find((n) => n > streak);
  return [
    {
      key: `streak:${userId}:${milestone}:${today}`,
      kind: 'streak-milestone',
      title: `${milestone}-day streak`,
      body: (
        <p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="flame" size={22} />
          {nextGoal ? `${streak} days in a row. Next up: ${nextGoal}.` : `${streak} days in a row. Legendary.`}
        </p>
      ),
      done: () => remember.set(store, streak),
    },
  ];
}

/** New chore approvals in the ledger, as one moment however many arrived. */
export function approvalMoments(userId: string, history: LedgerEntry[]): Moment[] {
  const paid = history.filter((entry) => entry.reason === 'chore_approved' || entry.reason === 'punctuality_bonus');
  const keyOf = (entry: LedgerEntry) => `approved:${entry.id}`;
  const fresh = unseen(`approved:${userId}`, paid.map(keyOf));
  const newOnes = paid.filter((entry) => fresh.has(keyOf(entry)));
  const chores = newOnes.filter((entry) => entry.reason === 'chore_approved');
  if (chores.length === 0) return [];
  const coins = newOnes.reduce((sum, entry) => sum + entry.delta, 0);
  const boostXp = newOnes.reduce((sum, entry) => sum + entry.boostXp, 0);
  const keys = newOnes.map(keyOf);
  return [
    {
      key: keys[0]!,
      alsoMarks: keys.slice(1),
      kind: 'chore-approved',
      title: chores.length === 1 ? chores[0]!.label : `${chores.length} chores approved`,
      body: boostXp > 0 ? (
        // CelebrationStats' markup, with the boost said in words on the XP line.
        <div className="celebration__stats">
          <span>
            <NeonArt group="icons" name="xp" size={40} />
            <strong>
              +{(coins + boostXp).toLocaleString('en-US')} XP <span className="neon-boost-tag">(2× BOOST)</span>
            </strong>
          </span>
          <span>
            <NeonArt group="icons" name="coin" size={40} />
            <strong>+{coins.toLocaleString('en-US')} coins</strong>
          </span>
        </div>
      ) : (
        <CelebrationStats xp={coins} coins={coins} />
      ),
    },
  ];
}

export function badgeMoments(userId: string, items: AchievementItem[]): Moment[] {
  const earned = items.filter((badge) => badge.earnedAt);
  const keyOf = (badge: AchievementItem) => `badge:${userId}:${badge.code}`;
  const fresh = unseen(`badges:${userId}`, earned.map(keyOf));
  return earned
    .filter((badge) => fresh.has(keyOf(badge)))
    .map((badge) => ({
      key: keyOf(badge),
      kind: 'badge-unlocked' as const,
      title: badge.name,
      art: <BadgeArt code={badge.code} earned size={190} />,
      body: (
        <>
          <p style={{ margin: 0 }}>Badge unlocked</p>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
            {badge.description}
          </p>
        </>
      ),
    }));
}

export function rewardMoments(userId: string, redemptions: Redemption[]): Moment[] {
  const granted = redemptions.filter((entry) => entry.status === 'approved' || entry.status === 'fulfilled');
  const keyOf = (entry: Redemption) => `reward:${entry.id}`;
  const fresh = unseen(`rewards:${userId}`, granted.map(keyOf));
  return granted
    .filter((entry) => fresh.has(keyOf(entry)))
    .map((entry) => ({
      key: keyOf(entry),
      kind: 'reward-unlocked' as const,
      title: `${entry.rewardName} unlocked`,
      art: <NeonArt group="rewards" name={rewardArt(entry.rewardName)} style={{ width: 200, height: 'auto' }} />,
      body: <p style={{ margin: 0 }}>A parent said yes. It&apos;s yours.</p>,
    }));
}
