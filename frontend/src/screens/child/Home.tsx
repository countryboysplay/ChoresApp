import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../../design/Avatar';
import { Icon } from '../../design/icons';
import { Badge, Button, LevelBar, Meter, PointsPill, Ring } from '../../design/primitives';
import { levelForLifetimePoints } from '../../config/levels';
import { bonusChores, children, coreChores } from '../../mock/data';
import { StatusBadge } from './choreStatus';

const me = children[0]!;

export function ChildHome() {
  const navigate = useNavigate();
  const level = levelForLifetimePoints(me.lifetimePoints);
  const chore = coreChores.find((entry) => entry.id === me.todayChoreId)!;
  const doneCount = chore.subtasks.filter((task) => task.done).length;
  const nextBonus = [...bonusChores]
    .filter((bonus) => !bonus.claimedBy)
    .sort((a, b) => b.points - a.points)[0]!;

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
            <Avatar config={me.avatar} size={48} label={`${me.name} avatar`} />
          </span>
          <span className="subtitle">{me.name}</span>
        </Link>
        <PointsPill value={me.spendablePoints} />
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
          <Ring value={doneCount} max={chore.subtasks.length} size={104} label="Steps finished today">
            <span style={{ lineHeight: 1 }}>
              <span
                className="numeric"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--gold)' }}
              >
                {doneCount}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                of {chore.subtasks.length}
              </span>
            </span>
          </Ring>
          <div style={{ flex: 1 }}>
            <Chest />
          </div>
        </div>
      </button>

      {/* Today's required chore */}
      <section className="card card--status is-info" style={{ marginTop: 'var(--space-4)', padding: 'var(--space-5)' }}>
        <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
          <span className="eyebrow">Today&apos;s required chore</span>
          <StatusBadge status={chore.status} />
        </div>

        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <span className="tile-icon tile-icon--gold">
            <Icon name={chore.icon} size={24} />
          </span>
          <div style={{ flex: 1 }}>
            <h2 className="subtitle" style={{ marginBottom: 4 }}>
              {chore.name}
            </h2>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <PointsPill value={chore.points} small />
              <span className="muted numeric" style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
                {doneCount} of {chore.subtasks.length} done
              </span>
            </div>
          </div>
        </div>

        <div style={{ margin: 'var(--space-4) 0' }}>
          <Meter value={doneCount} max={chore.subtasks.length} tone="green" />
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

      {/* Next bonus chore */}
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
            {me.streakDays} days
          </span>
        </span>
        <Icon name="tree" size={34} style={{ color: '#2e7d32' }} />
      </Link>

      {/* Recent win */}
      <div className="card card--status is-done row" style={{ marginTop: 'var(--space-4)' }}>
        <Icon name="check" size={22} style={{ color: 'var(--green)' }} />
        <div style={{ flex: 1 }}>
          <span className="eyebrow" style={{ color: 'var(--text-muted)' }}>
            Most recent win
          </span>
          <p style={{ margin: '2px 0 0', fontWeight: 700 }}>Kitchen Cleaning approved</p>
        </div>
        <Badge tone="done">+12</Badge>
      </div>
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
