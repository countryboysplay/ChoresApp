import { useState } from 'react';
import type { Chore } from '@chore-quest/shared';
import { Badge, Button, type BadgeTone } from '../../design/primitives';
import { Icon, type IconName } from '../../design/icons';
import { levelTier, neonUrl } from '../../design/neon';
import { api, ApiRequestError } from '../../lib/api';
import type { ChoreStatus } from '../../mock/data';
import '../../design/neon-kid.css';

/** Status is never communicated by color alone - each state has an icon and a label. */
const STATUS: Record<ChoreStatus, { label: string; tone: BadgeTone; icon: IconName }> = {
  not_started: { label: 'Not started', tone: 'neutral', icon: 'clock' },
  in_progress: { label: 'In progress', tone: 'info', icon: 'target' },
  submitted: { label: 'Waiting for approval', tone: 'waiting', icon: 'hourglass' },
  approved: { label: 'Approved', tone: 'done', icon: 'approve' },
  rejected: { label: 'Needs fixing', tone: 'late', icon: 'retake' },
  carried_over: { label: 'Carried over', tone: 'waiting', icon: 'calendar' },
  excused: { label: 'Excused', tone: 'info', icon: 'calendar-check' },
  missed: { label: 'Missed', tone: 'late', icon: 'close' },
};

/** Approved or excused: nothing left for the child to do. */
export function isFinished(status: string): boolean {
  return status === 'approved' || status === 'excused';
}

export function StatusBadge({ status }: { status: ChoreStatus }) {
  const config = STATUS[status];
  return (
    <Badge tone={config.tone} icon={config.icon}>
      {config.label}
    </Badge>
  );
}

export const statusAccent: Record<ChoreStatus, string> = {
  not_started: '',
  in_progress: 'is-info',
  submitted: 'is-waiting',
  approved: 'is-done',
  rejected: 'is-late',
  carried_over: 'is-waiting',
  excused: 'is-info',
  missed: 'is-late',
};

/* ---------- Shared NEON bits for the kid screens ---------- */

/**
 * What a chore pays: every point is both XP (levels) and coins (spendable).
 * A boost doubles the XP side only - coins are what cash-out converts to money.
 */
export function Loot({ points, row, boosted }: { points: number; row?: boolean; boosted?: boolean }) {
  return (
    <span className={`neon-loot${row ? ' neon-loot--row' : ''}`}>
      <span className="neon-loot__xp">
        <Icon name="xp" size={15} />+{boosted ? points * 2 : points} XP
        {boosted && <span className="neon-boost-tag">2×</span>}
      </span>
      <span className="neon-loot__coins">
        <Icon name="coin" size={15} />+{points} coins
      </span>
    </span>
  );
}

/** The pack's tier emblem with the level number stamped on it. */
export function TierEmblem({ level, size }: { level: number; size: number }) {
  return (
    <span className="neon-tier" style={{ width: size, height: size }} role="img" aria-label={`Level ${level}`}>
      <img src={neonUrl('achievements', levelTier(level))} alt="" aria-hidden="true" />
      <b aria-hidden="true" style={{ fontSize: Math.round(size * 0.3) }}>
        {level}
      </b>
    </span>
  );
}

/** Chores a boost can still go on or come off: anything a parent has not decided. */
const ARMABLE = ['not_started', 'in_progress', 'submitted', 'rejected'];

/**
 * Arm or take off an XP boost. Hidden when there is nothing to do: no boosts to
 * spend, or the chore is already decided. `onChange` reloads whatever owns the
 * chore so the boost count and the 2x tag move together.
 */
export function BoostToggle({
  chore,
  available,
  onChange,
}: {
  chore: Chore;
  available: number;
  onChange: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charging, setCharging] = useState(false);
  if (!ARMABLE.includes(chore.status) || (!chore.boosted && available <= 0)) return null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.chores.boost(chore.id, !chore.boosted);
      await onChange();
      if (!chore.boosted) setCharging(true);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`neon-boost${chore.boosted ? ' is-armed' : ''}${charging ? ' is-charging' : ''}`}
      onAnimationEnd={(event) => {
        if (event.animationName === 'boost-charge') setCharging(false);
      }}
    >
      <Icon name="bonus" size={22} />
      <span className="neon-boost__text">
        <strong>{chore.boosted ? 'Boost armed: 2× XP' : `Use a boost (${available} left)`}</strong>
        <span>
          {chore.boosted
            ? `Its XP doubles when approved, on-time bonus too. Coins stay +${chore.points}.`
            : 'Doubles the XP on this chore. Coins stay the same.'}
        </span>
        {error && <span role="alert">{error}</span>}
      </span>
      <Button tone={chore.boosted ? 'quiet' : 'gold'} disabled={busy} onClick={() => void toggle()} sound="tap">
        {chore.boosted ? 'Take off' : 'Boost'}
      </Button>
    </div>
  );
}
