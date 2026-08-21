import { Link, useNavigate } from 'react-router-dom';
import type { AvatarConfig } from '../../design/Avatar';
import { Avatar, DEFAULT_AVATAR } from '../../design/Avatar';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, LevelBar, Meter, PointsPill, Ring } from '../../design/primitives';
import { levelForLifetimePoints } from '../../config/levels';
import { useAuth } from '../../lib/auth';
import { useChildDay } from '../../lib/childDay';
import { StatusBadge } from './choreStatus';

export function ChildHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { day, loading, error } = useChildDay();

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
  const level = levelForLifetimePoints(summary.lifetimePoints);
  // The required chore is the first core one still outstanding, falling back to
  // the last of the day so a finished day still shows what was done.
  const chore =
    day.core.find((entry) => entry.status !== 'approved') ?? day.core[day.core.length - 1] ?? null;
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

  const name = user?.displayName ?? 'Player';
  const avatar = (user?.avatar as AvatarConfig | null) ?? DEFAULT_AVATAR;

  return (
    <main className="screen">
      {/* Player header */}
      <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
        <Link
          to="/child/profile"
          className="row"
          style={{ textDecoration: 'none', color: 'inherit', gap: 'var(--space-3)' }}
        >
          <span
            style={{
              padding: 3,
              borderRadius: '50%',
              background: 'linear-gradient(180deg, #ffd54f, var(--gold))',
              display: 'grid',
            }}
          >
            <Avatar config={avatar} size={48} label={`${name} avatar`} />
          </span>
          <span className="subtitle">{name}</span>
        </Link>
        <PointsPill value={summary.spendablePoints} />
      </div>

      <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <LevelBar level={level.level} into={level.pointsIntoLevel} span={level.levelSpan} />
        </div>
        <Link to="/child/profile" className="iconbtn" aria-label="Profile">
          <Icon name="user" size={20} />
        </Link>
        <Link to="/child/notifications" className="iconbtn" aria-label="Notifications">
          <Icon name="inbox" size={20} />
        </Link>
      </div>

      {/* Today's progress */}
      <button
        type="button"
        className="panel panel--sky card--interactive"
        style={{ display: 'block' }}
        onClick={() => navigate('/child/missions')}
      >
        <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
          <span className="eyebrow">Today&apos;s progress</span>
          <Icon name="arrow" size={20} />
        </div>
        <div className="row" style={{ gap: 'var(--space-4)' }}>
          <Ring value={dayDone} max={Math.max(dayTotal, 1)} size={104} label="Steps finished today">
            <span style={{ lineHeight: 1 }}>
              <span
                className="numeric"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--gold)' }}
              >
                {dayDone}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                of {dayTotal}
              </span>
            </span>
          </Ring>
          <div style={{ flex: 1 }}>
            <Chest />
          </div>
        </div>
      </button>

      {/* Today's required chore */}
      {chore ? (
        <section className="card card--status is-info" style={{ marginTop: 'var(--space-4)', padding: 'var(--space-5)' }}>
          <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
            <span className="eyebrow">Today&apos;s required chore</span>
            <StatusBadge status={chore.status} />
          </div>

          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <span className="tile-icon tile-icon--gold">
              <Icon name={chore.icon as IconName} size={24} />
            </span>
            <div style={{ flex: 1 }}>
              <h2 className="subtitle" style={{ marginBottom: 4 }}>
                {chore.name}
              </h2>
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <PointsPill value={chore.points} small />
                <span className="muted numeric" style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
                  {doneCount} of {totalCount} done
                </span>
              </div>
            </div>
          </div>

          <div style={{ margin: 'var(--space-4) 0' }}>
            <Meter value={doneCount} max={Math.max(totalCount, 1)} tone="green" />
          </div>

          <Button
            tone="purple"
            size="lg"
            block
            sound="tap"
            icon="target"
            onClick={() => navigate(`/child/chore/${chore.id}`)}
          >
            {doneCount === 0 ? 'Start chore' : 'Continue chore'}
          </Button>
        </section>
      ) : (
        // A real state, not an error: a day off, or nobody has set up a
        // schedule for this child yet.
        <section className="card" style={{ marginTop: 'var(--space-4)', textAlign: 'center' }}>
          <span className="eyebrow">Today&apos;s required chore</span>
          <p style={{ fontWeight: 700, margin: 'var(--space-3) 0 0' }}>Nothing due today</p>
          <p className="muted" style={{ margin: '4px 0 0' }}>Enjoy the day off.</p>
        </section>
      )}

      {/* The rest of the day.
          The card above shows one chore, which was the whole of Home when a
          child had one. A second required chore was invisible here - it was on
          Missions, but Home is the screen they open - so a child could finish
          what Home showed them and be told they had missed something. */}
      {alsoToday.length > 0 && (
        <section className="stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
          <span className="eyebrow">Also today</span>
          {alsoToday.map((entry) => {
            const done = entry.subtasks.filter((task) => task.done).length;
            return (
              <button
                key={entry.id}
                type="button"
                className="card card--interactive row"
                style={{ gap: 'var(--space-3)' }}
                onClick={() => navigate(`/child/chore/${entry.id}`)}
              >
                <span className="tile-icon tile-icon--gold tile-icon--sm">
                  <Icon name={entry.icon as IconName} size={20} />
                </span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ fontWeight: 800, display: 'block' }}>{entry.name}</span>
                  <span className="muted numeric" style={{ fontSize: 'var(--text-sm)' }}>
                    {done} of {entry.subtasks.length} done
                  </span>
                </span>
                <StatusBadge status={entry.status} />
              </button>
            );
          })}
        </section>
      )}

      {/* Next bonus chore. Hidden entirely when the board is empty rather than
          showing a panel that promises points nobody can claim. */}
      {nextBonus && (
        <button
          type="button"
          className="panel panel--purple card--interactive"
          style={{ marginTop: 'var(--space-4)', display: 'block' }}
          onClick={() => navigate('/child/missions')}
        >
          <div className="row row--between" style={{ marginBottom: 'var(--space-2)' }}>
            <span className="eyebrow">Next bonus chore</span>
            <Icon name="arrow" size={20} />
          </div>
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <span className="tile-icon tile-icon--gold">
              <Icon name="target" size={24} />
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontWeight: 800 }}>{nextBonus.name}</span>
              <span style={{ fontSize: 'var(--text-sm)', opacity: 0.85 }}>Claim it before it expires</span>
            </span>
            <strong className="numeric" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
              +{nextBonus.points} pts
            </strong>
          </div>
        </button>
      )}

      {/* Streak */}
      <Link
        to="/child/achievements"
        className="panel panel--pale row"
        style={{ marginTop: 'var(--space-4)', textDecoration: 'none', gap: 'var(--space-4)' }}
      >
        <span style={{ fontSize: 34 }} aria-hidden="true">
          <Icon name="flame" size={34} style={{ color: 'var(--red)' }} />
        </span>
        <span style={{ flex: 1 }}>
          <span className="eyebrow" style={{ color: 'rgba(30,30,47,0.7)' }}>
            Streak
          </span>
          <span
            style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600 }}
          >
            {summary.streakDays} {summary.streakDays === 1 ? 'day' : 'days'}
          </span>
        </span>
        <Icon name="tree" size={34} style={{ color: '#2e7d32' }} />
      </Link>

      {/* Recent win. Nothing to celebrate yet on a brand new account. */}
      {summary.recentWin && (
        <div className="card card--status is-done row" style={{ marginTop: 'var(--space-4)' }}>
          <Icon name="check" size={22} style={{ color: 'var(--green)' }} />
          <div style={{ flex: 1 }}>
            <span className="eyebrow" style={{ color: 'var(--text-muted)' }}>
              Most recent win
            </span>
            <p style={{ margin: '2px 0 0', fontWeight: 700 }}>{summary.recentWin.label}</p>
          </div>
          <Badge tone="done">+{summary.recentWin.delta}</Badge>
        </div>
      )}
    </main>
  );
}

/** Treasure chest, drawn in code to match the board without a raster asset. */
function Chest() {
  return (
    <svg viewBox="0 0 120 96" style={{ width: '100%', maxWidth: 132 }} aria-hidden="true">
      <ellipse cx="60" cy="88" rx="42" ry="6" fill="rgba(0,0,0,0.18)" />
      <path d="M22 44a38 24 0 0 1 76 0v6H22Z" fill="#a8752f" stroke="#6d4715" strokeWidth="3" />
      <rect x="22" y="50" width="76" height="34" rx="6" fill="#c08b3c" stroke="#6d4715" strokeWidth="3" />
      <rect x="22" y="56" width="76" height="8" fill="#e0b45f" />
      <rect x="52" y="50" width="16" height="22" rx="3" fill="#ffd54f" stroke="#6d4715" strokeWidth="3" />
      <circle cx="60" cy="62" r="3" fill="#6d4715" />
      <path d="M30 40a30 18 0 0 1 60 0" fill="none" stroke="#e0b45f" strokeWidth="4" />
    </svg>
  );
}
