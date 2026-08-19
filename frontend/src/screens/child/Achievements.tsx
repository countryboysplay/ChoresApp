import { useState } from 'react';
import { Icon } from '../../design/icons';
import { Badge, Button, Meter, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { achievements, streakCalendar, type Achievement } from '../../mock/data';
import { playSound } from '../../design/sound';

const CATEGORIES = ['Chores', 'Streaks', 'Bonus Chores', 'Points', 'Rewards'] as const;

export function Achievements() {
  const [reveal, setReveal] = useState<Achievement | null>(null);
  const earned = achievements.filter((badge) => badge.earned).length;

  return (
    <>
      <ScreenTop
        title="Achievements"
        trailing={<Badge tone="info">{earned} of {achievements.length}</Badge>}
      />
      <main className="screen">
        <section className="card">
          <h2 className="subtitle">Streak calendar</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 'var(--text-sm)' }}>
            Last four weeks. Sundays have no required chore, so they never break a streak.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {streakCalendar.map((day, index) => (
              <span
                key={index}
                title={day}
                style={{
                  aspectRatio: '1',
                  borderRadius: 8,
                  border: '1px solid var(--outline)',
                  display: 'grid',
                  placeItems: 'center',
                  background:
                    day === 'done'
                      ? 'rgba(0,200,83,0.28)'
                      : day === 'missed'
                        ? 'rgba(255,82,82,0.28)'
                        : day === 'paused'
                          ? 'rgba(64,124,254,0.22)'
                          : 'rgba(0,0,0,0.25)',
                  color: 'var(--text)',
                }}
              >
                {day === 'done' ? <Icon name="check" size={14} /> : null}
                {day === 'missed' ? <Icon name="close" size={14} /> : null}
                {day === 'paused' ? <Icon name="clock" size={14} /> : null}
              </span>
            ))}
          </div>
          <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Badge tone="done" icon="check">Done</Badge>
            <Badge tone="late" icon="close">Missed</Badge>
            <Badge tone="info" icon="clock">Paused</Badge>
            <Badge tone="neutral">Sunday</Badge>
          </div>
        </section>

        {CATEGORIES.map((category) => {
          const list = achievements.filter((badge) => badge.category === category);
          if (list.length === 0) return null;
          return (
            <section key={category} style={{ marginTop: 'var(--space-5)' }}>
              <h2 className="subtitle">{category}</h2>
              <div className="stack stack--tight">
                {list.map((badge) => (
                  <button
                    key={badge.id}
                    type="button"
                    className="card card--interactive stack stack--tight"
                    onClick={() => {
                      if (badge.earned) playSound('achievement');
                      setReveal(badge);
                    }}
                  >
                    <div className="row" style={{ gap: 'var(--space-3)' }}>
                      <span
                        className={`tile-icon ${badge.earned ? 'tile-icon--gold' : 'tile-icon--slate'}`}
                      >
                        <Icon name={badge.earned ? badge.icon : 'lock'} size={24} />
                      </span>
                      <span style={{ flex: 1 }}>
                        <strong style={{ display: 'block' }}>{badge.name}</strong>
                        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                          {badge.description}
                        </span>
                      </span>
                      {badge.earned ? <Badge tone="done" icon="check">Completed</Badge> : null}
                    </div>
                    {badge.progress ? (
                      <Meter
                        value={badge.progress.current}
                        max={badge.progress.target}
                        right={`${badge.progress.current} / ${badge.progress.target}`}
                        tone="gold"
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-5)' }}>
          Badges are for bragging rights. They do not award points.
        </p>
      </main>

      {reveal && (
        <Sheet
          title={reveal.earned ? 'Badge unlocked' : reveal.name}
          onClose={() => setReveal(null)}
          footer={
            <Button tone="primary" block onClick={() => setReveal(null)}>
              Nice
            </Button>
          }
        >
          <div className="celebrate" style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-3)' }}>
            <span
              className="iconbtn"
              style={{
                width: 110,
                height: 110,
                color: reveal.earned ? 'var(--gold)' : 'var(--text-muted)',
                background: reveal.earned ? 'rgba(255,193,7,0.14)' : undefined,
              }}
            >
              <Icon name={reveal.earned ? reveal.icon : 'lock'} size={52} />
            </span>
            <strong style={{ fontSize: 'var(--text-xl)' }}>{reveal.name}</strong>
            <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
              {reveal.description}
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}
