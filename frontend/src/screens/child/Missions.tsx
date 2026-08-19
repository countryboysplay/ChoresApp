import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../design/icons';
import { Badge, PointsPill, Segmented } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { countdown } from '../../config/format';
import { bonusChores, children, coreChores } from '../../mock/data';
import { StatusBadge } from './choreStatus';

const me = children[0]!;
const RANGE = ['Today', 'This week'] as const;
const SORTS = ['Highest points', 'Newest', 'Expiring soon'] as const;

export function Missions() {
  const navigate = useNavigate();
  const [range, setRange] = useState<(typeof RANGE)[number]>('Today');
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Highest points');

  const core = coreChores.find((chore) => chore.id === me.todayChoreId)!;
  const required = range === 'Today' ? [core] : coreChores;

  const board = useMemo(() => {
    const list = [...bonusChores];
    if (sort === 'Highest points') list.sort((a, b) => b.points - a.points);
    if (sort === 'Expiring soon')
      list.sort((a, b) => (a.expiresInMinutes ?? Infinity) - (b.expiresInMinutes ?? Infinity));
    return list;
  }, [sort]);

  return (
    <>
      <ScreenTop title="Missions" />
      <main className="screen">
        <Segmented options={RANGE} value={range} onChange={setRange} label="Time range" />

        <section style={{ marginTop: 'var(--space-5)' }}>
          <span className="eyebrow">Required chores</span>
          <div className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
            {required.map((chore) => {
              const done = chore.subtasks.filter((task) => task.done).length;
              return (
                <button
                  key={chore.id}
                  type="button"
                  className="card card--interactive row"
                  onClick={() => navigate(`/child/chore/${chore.id}`)}
                >
                  <span className="tile-icon tile-icon--gold tile-icon--sm">
                    <Icon name={chore.icon} size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, display: 'block' }}>{chore.name}</span>
                    <span className="muted numeric" style={{ fontSize: 'var(--text-sm)' }}>
                      {done} of {chore.subtasks.length} steps
                    </span>
                  </span>
                  <PointsPill value={chore.points} small />
                  <StatusIcon done={done === chore.subtasks.length} />
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <StatusBadge status={core.status} />
          </div>
        </section>

        <section style={{ marginTop: 'var(--space-5)' }}>
          <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
            <span className="eyebrow">Bonus chores</span>
            <Badge tone="bonus">{board.filter((chore) => !chore.claimedBy).length} open</Badge>
          </div>

          <div className="chip-row" role="group" aria-label="Sort bonus chores">
            {SORTS.map((option) => (
              <button
                key={option}
                type="button"
                className="chip"
                aria-pressed={sort === option}
                onClick={() => setSort(option)}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
            {board.map((bonus) => (
              <button
                key={bonus.id}
                type="button"
                className="card card--interactive"
                onClick={() => navigate(`/child/chore/${bonus.id}`)}
              >
                <div className="row" style={{ gap: 'var(--space-3)' }}>
                  <span className="tile-icon tile-icon--purple tile-icon--sm">
                    <Icon name={bonus.icon} size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, display: 'block' }}>{bonus.name}</span>
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {bonus.expiresInMinutes ? countdown(bonus.expiresInMinutes) : 'No deadline'}
                    </span>
                  </span>
                  <PointsPill value={bonus.points} small />
                  <Icon name="chevron" size={18} />
                </div>
                {bonus.claimedBy ? (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <Badge tone="waiting" icon="lock">
                      Claimed by {bonus.claimedBy}
                    </Badge>
                  </div>
                ) : bonus.expiresInMinutes && bonus.expiresInMinutes < 120 ? (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <Badge tone="soon" icon="clock">
                      Due soon
                    </Badge>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function StatusIcon({ done }: { done: boolean }) {
  return (
    <span
      style={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        border: `2px solid ${done ? 'var(--green)' : 'var(--outline-strong)'}`,
        background: done ? 'var(--green)' : 'transparent',
        color: done ? 'var(--text-on-green)' : 'transparent',
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <Icon name="check" size={15} />
    </span>
  );
}
