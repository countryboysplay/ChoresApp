import { useState } from 'react';
import { Avatar } from '../../design/Avatar';
import { Icon } from '../../design/icons';
import { PointsPill, Segmented, Tile } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { levelForLifetimePoints } from '../../config/levels';
import { children } from '../../mock/data';

const RANGE = ['This week', 'All time'] as const;

/**
 * Kids only. Parent accounts never appear here - the leaderboard is a
 * head-to-head between the children, ranked by lifetime points and tie-broken on
 * approved chores.
 */
export function Leaderboard() {
  const [range, setRange] = useState<(typeof RANGE)[number]>('This week');
  const ranked = [...children].sort(
    (a, b) => b.lifetimePoints - a.lifetimePoints || b.approvedChores - a.approvedChores,
  );
  const [first, second] = ranked;

  return (
    <>
      <ScreenTop title="Leaderboard" />
      <main className="screen">
        <Segmented options={RANGE} value={range} onChange={setRange} label="Leaderboard range" />

        <section className="panel panel--navy" style={{ marginTop: 'var(--space-4)' }}>
          <div
            className="row"
            style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 'var(--space-5)' }}
          >
            {second && <Podium child={second} place={2} />}
            {first && <Podium child={first} place={1} />}
          </div>
        </section>

        <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
          {ranked.map((child, index) => {
            const level = levelForLifetimePoints(child.lifetimePoints);
            return (
              <article key={child.id} className="card stack stack--tight">
                <div className="row" style={{ gap: 'var(--space-3)' }}>
                  <span
                    className="numeric"
                    style={{
                      width: 34,
                      height: 34,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '50%',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      color: index === 0 ? 'var(--text-on-gold)' : '#fff',
                      background:
                        index === 0
                          ? 'linear-gradient(180deg, #ffd54f, var(--gold))'
                          : index === 1
                            ? 'linear-gradient(180deg, #d7dbe6, #9aa1b4)'
                            : 'var(--surface-raised)',
                    }}
                  >
                    {index + 1}
                  </span>
                  <Avatar config={child.avatar} size={48} label={`${child.name} avatar`} />
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: 'block' }}>{child.name}</strong>
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      Level {level.level}
                    </span>
                  </span>
                  <PointsPill
                    value={range === 'This week' ? child.weekPoints : child.lifetimePoints}
                    small
                  />
                </div>

                <div className="grid-2">
                  <Tile value={child.weekPoints} label="Points this week" />
                  <Tile value={child.spendablePoints} label="Spendable now" />
                  <Tile
                    value={
                      <span className="row" style={{ justifyContent: 'center', gap: 4 }}>
                        <Icon name="flame" size={18} />
                        {child.streakDays}
                      </span>
                    }
                    label="Day streak"
                  />
                  <Tile value={child.badges} label="Badges" />
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}

function Podium({ child, place }: { child: (typeof children)[number]; place: 1 | 2 }) {
  const height = place === 1 ? 92 : 64;
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-2)' }}>
      <Avatar config={child.avatar} size={place === 1 ? 76 : 60} label={`${child.name} avatar`} />
      <strong>{child.name}</strong>
      <div
        style={{
          width: 90,
          height,
          borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
          background:
            place === 1
              ? 'linear-gradient(180deg, var(--gold), #ff9800)'
              : 'linear-gradient(180deg, #c9ccd8, #8b90a3)',
          display: 'grid',
          placeItems: 'center',
          color: '#2b2100',
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl)',
          fontWeight: 800,
        }}
      >
        {place}
      </div>
    </div>
  );
}
