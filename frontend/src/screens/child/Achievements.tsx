import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AchievementItem, StreakDay } from '@chore-quest/shared';
import { Icon } from '../../design/icons';
import { BadgeArt } from '../../design/neon';
import { Badge, Button, Meter, Segmented, Sheet, EmptyState } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';
import { playSound } from '../../design/sound';
import { useAuth } from '../../lib/auth';
import { badgeMoments, CelebrationQueue } from './celebrations';
import '../../design/neon-polish.css';

const TABS = ['All', 'In progress', 'Locked', 'Earned'] as const;
export type AchievementTab = (typeof TABS)[number];

/** In progress is started but unearned; Locked is not started yet. */
export function achievementTab(badge: AchievementItem): Exclude<AchievementTab, 'All'> {
  if (badge.earnedAt) return 'Earned';
  return badge.progress > 0 ? 'In progress' : 'Locked';
}

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
  const [tab, setTab] = useState<AchievementTab>('All');
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

  const { mode, user } = useAuth();
  const userId = mode === 'live' ? user?.id : undefined;
  // Same keys as Home, so a badge earned is celebrated once wherever it is seen first.
  const moments = useMemo(() => (userId && items.length ? badgeMoments(userId, items) : []), [userId, items]);

  const earned = items.filter((badge) => badge.earnedAt).length;
  const shown = tab === 'All' ? items : items.filter((badge) => achievementTab(badge) === tab);
  const categories = [...new Set(shown.map((badge) => badge.category))];

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
        <CelebrationQueue moments={moments} />
        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        {earned === 0 && items.length > 0 && (
          <section className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <EmptyState
              art="no-badges-yet"
              title="No badges yet"
              message="Get your first chore approved and the first one drops."
            />
          </section>
        )}

        <section className="card">
          <h2 className="subtitle row" style={{ gap: 'var(--space-2)' }}>
            <Icon name="flame" size={22} /> Streak calendar
          </h2>
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

        <div className="polish-seg4" style={{ marginTop: 'var(--space-5)' }}>
          <Segmented options={TABS} value={tab} onChange={setTab} label="Filter badges" />
        </div>

        {shown.length === 0 && items.length > 0 && (
          <p className="muted" style={{ textAlign: 'center', marginTop: 'var(--space-5)' }}>
            {tab === 'Earned'
              ? 'Nothing earned yet. Your first approved chore starts it.'
              : tab === 'In progress'
                ? 'Nothing started yet.'
                : 'Nothing locked. Every badge is underway.'}
          </p>
        )}

        {categories.map((category) => {
          const list = shown.filter((badge) => badge.category === category);
          return (
            <section key={category} style={{ marginTop: 'var(--space-5)' }}>
              <h2 className="subtitle">{category}</h2>
              <div className="neon-achievements">
                {list.map((badge) => {
                  const isEarned = Boolean(badge.earnedAt);
                  return (
                    <button
                      key={badge.code}
                      type="button"
                      className={`neon-achievement${isEarned ? ' is-earned' : ''}`}
                      onClick={() => {
                        if (isEarned) playSound('achievement');
                        setReveal(badge);
                      }}
                    >
                      <BadgeArt code={badge.code} earned={isEarned} size={72} />
                      <strong>{badge.name}</strong>
                      <small>{badge.description}</small>
                      {/* Only where there is something to watch. A meter on a
                          one-shot badge is a bar that reads nought or one. */}
                      {!isEarned && badge.target > 1 ? (
                        <div className="neon-meter">
                          <Meter value={badge.progress} max={badge.target} tone="gold" name={`Progress towards ${badge.name}`} />
                        </div>
                      ) : null}
                      <span className="neon-achievement__state">
                        <Icon name={isEarned ? 'check' : 'lock'} size={14} />
                        {isEarned
                          ? 'Unlocked'
                          : badge.target > 1
                            ? `${badge.progress} / ${badge.target}`
                            : 'Locked'}
                      </span>
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
            <BadgeArt code={reveal.code} earned={Boolean(reveal.earnedAt)} size={140} />
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
