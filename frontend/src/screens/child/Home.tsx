import { useEffect, useState } from 'react';
import type { FamilyGoal } from '@chore-quest/shared';
import { Link, useNavigate } from 'react-router-dom';
import type { AvatarConfig } from '../../design/Avatar';
import { Avatar, DEFAULT_AVATAR } from '../../design/Avatar';
import { Icon, type IconName } from '../../design/icons';
import { NeonArt } from '../../design/neon';
import { Button } from '../../design/primitives';
import { levelForLifetimePoints } from '../../config/levels';
import { countdown } from '../../config/format';
import { api } from '../../lib/api';
import { useCatchUp, useTween } from '../../lib/motion';
import { useAuth } from '../../lib/auth';
import { useChildDay } from '../../lib/childDay';
import { BoostToggle, Loot, StatusBadge, statusAccent } from './choreStatus';
import {
  approvalMoments,
  badgeMoments,
  CelebrationQueue,
  levelMoments,
  mergeMoments,
  rewardMoments,
  streakMoments,
  type Moment,
} from './celebrations';

const FINISHED = ['approved', 'excused'];

export function ChildHome() {
  const navigate = useNavigate();
  const { user, mode } = useAuth();
  const { day, loading, error, reload } = useChildDay();
  const [moments, setMoments] = useState<Moment[]>([]);
  const userId = mode === 'live' ? user?.id : undefined;
  // Gains made while away play out once they can be seen: after the moments
  // have loaded and no celebration is covering the screen.
  const [momentsLoaded, setMomentsLoaded] = useState(!userId);
  const [celebrationIdle, setCelebrationIdle] = useState(true);
  const hold = !momentsLoaded || !celebrationIdle || !day;
  const seenKey = userId ?? 'preview';
  const coins = useTween(useCatchUp(`${seenKey}:coins`, day?.summary.spendablePoints, hold));
  const xp = useTween(useCatchUp(`${seenKey}:xp`, day?.summary.lifetimePoints, hold));

  // Level and streak come with the day.
  useEffect(() => {
    if (!userId || !day) return;
    setMoments((list) =>
      mergeMoments(list, [
        ...levelMoments(userId, day.summary.lifetimePoints),
        ...streakMoments(userId, day.summary.streakDays, day.today),
      ]),
    );
  }, [userId, day]);

  // Approvals, badges and granted rewards live elsewhere; read them once per visit.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void Promise.allSettled([api.wallet.mine(), api.achievements.mine(), api.rewards.mine()]).then(
      ([wallet, badges, rewards]) => {
        if (cancelled) return;
        setMomentsLoaded(true);
        setMoments((list) =>
          mergeMoments(list, [
            ...(wallet.status === 'fulfilled' ? approvalMoments(userId, wallet.value.history) : []),
            ...(badges.status === 'fulfilled' ? badgeMoments(userId, badges.value.achievements) : []),
            ...(rewards.status === 'fulfilled' ? rewardMoments(userId, rewards.value.redemptions) : []),
          ]),
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading && !day) {
    return (
      <main className="screen">
        <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-7)' }}>
          Loading today&hellip;
        </p>
      </main>
    );
  }

  if (!day) {
    return (
      <main className="screen">
        <div className="card card--status is-late" style={{ marginTop: 'var(--space-6)' }}>
          <p style={{ fontWeight: 700 }}>{error ?? 'Could not load today.'}</p>
        </div>
      </main>
    );
  }

  const { summary } = day;
  const level = levelForLifetimePoints(xp ?? summary.lifetimePoints);
  const coinsShown = coins ?? summary.spendablePoints;
  const allDone = day.core.length > 0 && day.core.every((entry) => FINISHED.includes(entry.status));
  // The required chore is the first core one still outstanding. Once the whole
  // day is approved the card gives way to the all-clear.
  const chore = day.core.find((entry) => !FINISHED.includes(entry.status)) ?? null;
  const doneCount = chore ? chore.subtasks.filter((task) => task.done).length : 0;
  const totalCount = chore ? chore.subtasks.length : 0;

  /*
   * The ring counts the whole day, not the chore in the card under it.
   *
   * It is labelled "Steps finished today" and counted one chore's checklist,
   * which is the same number only while a child has exactly one chore. With two
   * it reads five of five with half the day left, and a progress ring that says
   * finished when it is not is worse than no ring.
   */
  const dayDone = day.core.reduce(
    (sum, entry) => sum + entry.subtasks.filter((task) => task.done).length,
    0,
  );
  const dayTotal = day.core.reduce((sum, entry) => sum + entry.subtasks.length, 0);

  /** The chores the card above is not already showing. */
  const alsoToday = day.core.filter((entry) => entry.id !== chore?.id);
  const nextBonus = [...day.availableBonus].sort((a, b) => b.points - a.points)[0] ?? null;
  const bonusMinutes = nextBonus?.expiresAt
    ? Math.max(0, Math.round((new Date(nextBonus.expiresAt).getTime() - Date.now()) / 60_000))
    : null;

  const name = user?.displayName ?? 'Player';
  const avatar = (user?.avatar as AvatarConfig | null) ?? DEFAULT_AVATAR;
  const levelPct = level.levelSpan ? Math.min(100, (level.pointsIntoLevel / level.levelSpan) * 100) : 100;

  return (
    <main className="screen hud-screen">
      <CelebrationQueue moments={moments} onIdle={setCelebrationIdle} />

      {/* The player plate: who, what level, what they hold. */}
      <header className="hud plate">
        <Link to="/child/profile" className="hud__avatar" aria-label={`${name} profile`}>
          <svg className="hud__ring" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <linearGradient id="hud-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffe498" />
                <stop offset="100%" stopColor="#f2a33c" />
              </linearGradient>
            </defs>
            <circle className="hud__ring-track" cx="50" cy="50" r="46" pathLength={100} />
            <circle
              className="hud__ring-fill"
              cx="50"
              cy="50"
              r="46"
              pathLength={100}
              strokeDasharray="100"
              strokeDashoffset={100 - levelPct}
            />
          </svg>
          <Avatar config={avatar} size={62} />
          <span key={level.level} className="hud__lvl numeric">
            {level.level}
          </span>
        </Link>

        <div className="hud__id">
          <span className="hud__name">{name}</span>
          <span className="hud__xp numeric">
            {level.levelSpan
              ? `${level.pointsIntoLevel.toLocaleString('en-US')} / ${level.levelSpan.toLocaleString('en-US')} XP`
              : 'Max level'}
          </span>
          <div
            className="hud__xpbar"
            role="progressbar"
            aria-label={`Level ${level.level} progress`}
            aria-valuenow={Math.round(levelPct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${levelPct}%` }} />
          </div>
        </div>

        <Link to="/child/notifications" className="hud__bell" aria-label="Notifications">
          <Icon name="bell" size={20} />
        </Link>

        <div className="hud__stats">
          <span className="hud-stat hud-stat--coin">
            <Icon name="coin" size={20} />
            <b className="numeric">{coinsShown.toLocaleString('en-US')}</b>
            <small>Coins</small>
          </span>
          <span className={`hud-stat hud-stat--boost${summary.boosts > 0 ? ' is-live' : ''}`}>
            <Icon name="bonus" size={20} />
            <b className="numeric">{summary.boosts}</b>
            <small>{summary.boosts === 1 ? 'Boost' : 'Boosts'}</small>
          </span>
          <Link to="/child/achievements" className="hud-stat hud-stat--streak">
            <Icon name="flame" size={20} />
            <b className="numeric">{summary.streakDays}</b>
            <small>Day streak</small>
          </Link>
        </div>
      </header>

      {/* Today's run: every required chore as a stop, the chest at the end. */}
      <DayRun
        chores={day.core}
        current={chore?.id ?? null}
        done={dayDone}
        total={dayTotal}
        allDone={allDone}
        seenKey={`${seenKey}:steps:${day.today}`}
        hold={hold}
        onOpen={() => navigate('/child/missions')}
      />

      {/* The mission. */}
      {chore ? (
        <section className={`mission plate is-${chore.status}`} aria-labelledby="mission-title">
          <div className="mission__top">
            <span className="mission__tag">Today&apos;s quest</span>
            <StatusBadge status={chore.status} />
          </div>

          <div className="mission__art" aria-hidden="true">
            <span className="mission__core">
              <Icon name={chore.icon as IconName} size={64} />
            </span>
          </div>

          <h2 id="mission-title" className="mission__title">
            {chore.name}
          </h2>

          <div
            className="mission__pips"
            role="progressbar"
            aria-label={`${chore.name} steps done`}
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={totalCount}
          >
            {chore.subtasks.map((task, index) => (
              <i key={index} className={task.done ? 'is-on' : ''} />
            ))}
          </div>
          <div className="mission__meta">
            <span className="numeric">
              {doneCount} of {totalCount} done
            </span>
            <span>
              <Icon name="calendar-check" size={14} /> Due today
            </span>
          </div>

          <div className="mission__loot">
            <Loot points={chore.points} row boosted={chore.boosted} />
          </div>

          {mode === 'live' && <BoostToggle chore={chore} available={summary.boosts} onChange={reload} />}

          <Button
            tone="purple"
            size="lg"
            block
            sound="tap"
            icon="target"
            className="cta"
            onClick={() => navigate(`/child/chore/${chore.id}`)}
          >
            {doneCount === 0 ? 'Start chore' : 'Continue chore'}
          </Button>
        </section>
      ) : (
        // A real state, not an error: everything approved, a day off, or
        // nobody has set up a schedule for this child yet.
        <section className={`mission plate mission--clear${allDone ? ' is-won' : ''}`} aria-labelledby="mission-title">
          <NeonArt
            group="states"
            name={allDone ? 'all-done-today' : 'no-chores'}
            className="float mission__clear-art"
          />
          <h2 id="mission-title" className="mission__title">
            {allDone ? 'All clear' : 'Nothing due today'}
          </h2>
          <p className="mission__clear-note">
            {allDone ? 'Every quest approved. The day is yours.' : 'Enjoy the day off.'}
          </p>
        </section>
      )}

      {/* The rest of the day, and the best bonus on the board.
          The card above shows one chore; a second required chore must still be
          visible here, or a child finishes what Home shows and misses one. */}
      {(alsoToday.length > 0 || nextBonus) && (
        <section className="sidequests" aria-labelledby="sidequests-title">
          <h2 id="sidequests-title" className="hud-h">
            {chore ? 'Next up' : 'Done today'}
          </h2>
          {alsoToday.map((entry) => {
            const done = entry.subtasks.filter((task) => task.done).length;
            return (
              <button
                key={entry.id}
                type="button"
                className={`sidequest ${statusAccent[entry.status]}`}
                onClick={() => navigate(`/child/chore/${entry.id}`)}
              >
                <span className="sidequest__icon">
                  <Icon name={entry.icon as IconName} size={22} />
                </span>
                <span className="sidequest__main">
                  <strong>{entry.name}</strong>
                  <span className="sidequest__meta">
                    <span className="numeric">
                      {done} of {entry.subtasks.length} done
                    </span>
                    <StatusBadge status={entry.status} />
                  </span>
                </span>
                <Loot points={entry.points} boosted={entry.boosted} />
              </button>
            );
          })}
          {nextBonus && (
            <button type="button" className="sidequest sidequest--bonus" onClick={() => navigate('/child/missions')}>
              <span className="sidequest__icon">
                <Icon name="bonus" size={22} />
              </span>
              <span className="sidequest__main">
                <strong>
                  <span className="sidequest__flag">Bonus</span> {nextBonus.name}
                </strong>
                <span className="sidequest__meta">
                  <span>
                    <Icon name="timer" size={14} />
                    {bonusMinutes === null ? 'No deadline' : countdown(bonusMinutes)}
                  </span>
                </span>
              </span>
              <Loot points={nextBonus.points} />
            </button>
          )}
        </section>
      )}

      {/* The family goal. No goal set, no bar. */}
      {summary.familyGoal && <FamilyGoalBar goal={summary.familyGoal} seenKey={seenKey} hold={hold} />}

      {/* Most recent win. Nothing to show yet on a brand new account. */}
      {summary.recentWin && (
        <div className="lastwin">
          <Icon name="check" size={18} />
          <span className="lastwin__label">
            <b>Last win</b> {summary.recentWin.label}
          </span>
          <span className="lastwin__xp numeric">+{summary.recentWin.delta} XP</span>
        </div>
      )}
    </main>
  );
}

type RunChore = { id: string; name: string; icon: string; status: string };

/**
 * Steps done across today's chores as a track of stops ending in the chest.
 * The line sweeps up from what this device last saw (see useCatchUp).
 */
function DayRun({
  chores,
  current,
  done,
  total,
  allDone,
  seenKey,
  hold,
  onOpen,
}: {
  chores: RunChore[];
  current: string | null;
  done: number;
  total: number;
  allDone: boolean;
  seenKey: string;
  hold: boolean;
  onOpen: () => void;
}) {
  const seen = useCatchUp(seenKey, done, hold);
  const shown = useTween(seen);
  const pct = total > 0 ? Math.min(100, (seen / total) * 100) : 0;

  const stateOf = (chore: RunChore) =>
    FINISHED.includes(chore.status)
      ? 'is-done'
      : chore.id === current
        ? 'is-current'
        : chore.status === 'submitted'
          ? 'is-waiting'
          : chore.status === 'rejected' || chore.status === 'missed'
            ? 'is-late'
            : '';

  return (
    <button type="button" className={`run plate${allDone ? ' is-won' : ''}`} onClick={onOpen} aria-label="Today's quests">
      <span className="run__head">
        <span className="hud-h">Today&apos;s run</span>
        <span className="run__count numeric">
          <b>{shown}</b> / {total} steps
        </span>
      </span>
      <span className="run__track">
        <span
          className="run__line"
          role="progressbar"
          aria-label="Steps finished today"
          aria-valuenow={seen}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <i style={{ width: `${pct}%` }} />
        </span>
        {chores.map((chore) => (
          <span key={chore.id} className={`run__node ${stateOf(chore)}`} title={chore.name}>
            <Icon name={(FINISHED.includes(chore.status) ? 'check' : chore.icon) as IconName} size={18} />
          </span>
        ))}
        <span className={`run__node run__node--chest${allDone ? ' is-open' : ''}`} title="Day reward">
          <Icon name="chest" size={22} />
        </span>
      </span>
    </button>
  );
}

/**
 * Everyone's XP this household week against the goal a parent set. The bar
 * moves from where this device last saw it, so siblings' progress shows as progress.
 */
function FamilyGoalBar({ goal, seenKey, hold }: { goal: FamilyGoal; seenKey: string; hold: boolean }) {
  const seen = useCatchUp(`${seenKey}:goal:${goal.weekStart}`, goal.xp, hold);
  const xp = useTween(seen);
  const reached = xp >= goal.target;
  const pct = goal.target > 0 ? Math.min(100, (seen / goal.target) * 100) : 0;
  return (
    <section className={`squad plate${reached ? ' is-reached' : ''}`} aria-labelledby="squad-title">
      <div className="squad__head">
        <h2 id="squad-title" className="hud-h">
          <Icon name="users" size={16} /> Family goal
        </h2>
        <span className="squad__count numeric">
          {xp.toLocaleString('en-US')} / {goal.target.toLocaleString('en-US')} XP
        </span>
      </div>
      <div
        className="squad__bar"
        role="progressbar"
        aria-label="Family goal"
        aria-valuenow={Math.min(seen, goal.target)}
        aria-valuemin={0}
        aria-valuemax={goal.target}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="squad__note">
        {reached ? <Icon name="check" size={16} /> : null}
        {reached
          ? `Goal reached${goal.reward ? `: ${goal.reward}!` : '!'}`
          : `${(goal.target - xp).toLocaleString('en-US')} XP to go together${goal.reward ? ` for ${goal.reward}` : ''}.`}
      </p>
    </section>
  );
}
