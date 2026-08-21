import { useCallback, useEffect, useState } from 'react';
import type { AchievementItem, StreakDay } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, Meter, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';
import { playSound } from '../../design/sound';

/**
 * Badges, and the four weeks behind them.
 *
 * Both were a hardcoded array until now, which meant both children saw the same
 * badges and the same calendar whatever either of them had actually done. The
 * server works out both from the household's own records every time it is
 * asked, so there is nothing here that can drift out of step with the ledger.
 *
 * Categories come from the data rather than a list in this file: adding a badge
 * in a new category should not need a second edit here to make it appear.
 */
export function Achievements() {
  const [items, setItems] = useState<AchievementItem[]>([]);
  const [calendar, setCalendar] = useState<StreakDay[]>([]);
  const [reveal, setReveal] = useState<AchievementItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.achievements.mine();
      setItems(response.achievements);
      setCalendar(response.streakCalendar);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'Could not load your badges.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const earned = items.filter((badge) => badge.earnedAt).length;
  const categories = [...new Set(items.map((badge) => badge.category))];

  if (loading) {
    return (
      <>
        <ScreenTop title="Achievements" />
        <main className="screen">
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            Loading&hellip;
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <ScreenTop
        title="Achievements"
        trailing={<Badge tone="info">{earned} of {items.length}</Badge>}
      />
      <main className="screen">
        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        <section className="card">
          <h2 className="subtitle">Streak calendar</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 'var(--text-sm)' }}>
            The last four weeks. A day with no chore on it never breaks a streak.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {calendar.map((day) => (
              <span
                key={day.date}
                // The date and the state both, because the colour alone is not
                // a label and a square nobody can name is not information.
                title={`${day.date}: ${day.state}`}
                style={{
                  aspectRatio: '1',
                  borderRadius: 8,
                  border: '1px solid var(--outline)',
                  display: 'grid',
                  placeItems: 'center',
                  background:
                    day.state === 'done'
                      ? 'rgba(0,200,83,0.28)'
                      : day.state === 'missed'
                        ? 'rgba(255,82,82,0.28)'
                        : day.state === 'paused'
                          ? 'rgba(64,124,254,0.22)'
                          : 'rgba(0,0,0,0.25)',
                  color: 'var(--text)',
                }}
              >
                {day.state === 'done' ? <Icon name="check" size={14} /> : null}
                {day.state === 'missed' ? <Icon name="close" size={14} /> : null}
                {day.state === 'paused' ? <Icon name="clock" size={14} /> : null}
              </span>
            ))}
          </div>
          <div
            className="row"
            style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}
          >
            <Badge tone="done" icon="check">Done</Badge>
            <Badge tone="late" icon="close">Missed</Badge>
            <Badge tone="info" icon="clock">Paused</Badge>
            <Badge tone="neutral">Nothing due</Badge>
          </div>
        </section>

        {categories.map((category) => {
          const list = items.filter((badge) => badge.category === category);
          return (
            <section key={category} style={{ marginTop: 'var(--space-5)' }}>
              <h2 className="subtitle">{category}</h2>
              <div className="stack stack--tight">
                {list.map((badge) => {
                  const isEarned = Boolean(badge.earnedAt);
                  return (
                    <button
                      key={badge.code}
                      type="button"
                      className="card card--interactive stack stack--tight"
                      onClick={() => {
                        if (isEarned) playSound('achievement');
                        setReveal(badge);
                      }}
                    >
                      <div className="row" style={{ gap: 'var(--space-3)' }}>
                        <span
                          className={`tile-icon ${isEarned ? 'tile-icon--gold' : 'tile-icon--slate'}`}
                        >
                          <Icon name={(isEarned ? badge.icon : 'lock') as IconName} size={24} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ display: 'block' }}>{badge.name}</strong>
                          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                            {badge.description}
                          </span>
                        </span>
                        {isEarned ? <Badge tone="done" icon="check">Completed</Badge> : null}
                      </div>
                      {/* Only where there is something to watch. A meter on a
                          one-shot badge is a bar that reads nought or one. */}
                      {!isEarned && badge.target > 1 ? (
                        <Meter
                          value={badge.progress}
                          max={badge.target}
                          right={`${badge.progress} / ${badge.target}`}
                          tone="gold"
                        />
                      ) : null}
                    </button>
                  );
                })}
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
          title={reveal.earnedAt ? 'Badge unlocked' : reveal.name}
          onClose={() => setReveal(null)}
          footer={
            <Button tone="primary" block onClick={() => setReveal(null)}>
              Nice
            </Button>
          }
        >
          <div
            className="celebrate"
            style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-3)' }}
          >
            <span
              className="iconbtn"
              style={{
                width: 110,
                height: 110,
                color: reveal.earnedAt ? 'var(--gold)' : 'var(--text-muted)',
                background: reveal.earnedAt ? 'rgba(255,193,7,0.14)' : undefined,
              }}
            >
              <Icon name={(reveal.earnedAt ? reveal.icon : 'lock') as IconName} size={52} />
            </span>
            <strong style={{ fontSize: 'var(--text-xl)' }}>{reveal.name}</strong>
            <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
              {reveal.description}
            </p>
            {!reveal.earnedAt && reveal.target > 1 && (
              <p className="muted numeric" style={{ margin: 0 }}>
                {reveal.progress} of {reveal.target}
              </p>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
