import { useCallback, useEffect, useState } from 'react';
import type { StandingEntry } from '@chore-quest/shared';
import type { AvatarConfig } from '../../design/Avatar';
import { Avatar, DEFAULT_AVATAR } from '../../design/Avatar';
import { Icon } from '../../design/icons';
import { EmptyState, Segmented } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { levelForLifetimePoints } from '../../config/levels';
import { api, ApiRequestError } from '../../lib/api';
import { TierEmblem } from './choreStatus';

const RANGE = ['This week', 'This month', 'All time'] as const;

/** The API hands back `unknown`; every child has one whether or not they set it. */
function avatarOf(entry: StandingEntry): AvatarConfig {
  return (entry.avatar as AvatarConfig | null) ?? DEFAULT_AVATAR;
}

/**
 * Kids only. Parent accounts never appear here - the leaderboard is a
 * head-to-head between the children, and the endpoint selects `role = 'child'`
 * rather than leaving it to this screen to filter.
 *
 * The range control ranks as well as counts. Ordering by lifetime points while
 * the pill showed this week's was the sort of half-answer a child spots in a
 * second: second place with the bigger number is not a leaderboard anybody
 * believes.
 */
export function Leaderboard() {
  const [range, setRange] = useState<(typeof RANGE)[number]>('This week');
  const [entries, setEntries] = useState<StandingEntry[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.standings.leaderboard();
      setEntries(response.entries);
      setMeId(response.meId);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'Could not load the leaderboard.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const points = (entry: StandingEntry) =>
    range === 'This week' ? entry.weekPoints : range === 'This month' ? entry.monthPoints : entry.lifetimePoints;

  const ranked = [...entries].sort(
    (a, b) =>
      points(b) - points(a) ||
      b.streakDays - a.streakDays ||
      a.displayName.localeCompare(b.displayName),
  );
  const [first, second, third] = ranked;

  if (loading) {
    return (
      <>
        <ScreenTop title="Leaderboard" />
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
      <ScreenTop title="Leaderboard" />
      <main className="screen">
        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        <Segmented options={RANGE} value={range} onChange={setRange} label="Leaderboard range" />

        {ranked.length === 0 ? (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <EmptyState
              icon="trophy"
              title="Nobody on the board yet"
              message="Finish a chore and get it approved, and you are on it."
            />
          </div>
        ) : (
          <>
            <section className="panel panel--navy" style={{ marginTop: 'var(--space-4)', paddingBottom: 0 }}>
              <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                <Icon name="podium" size={22} />
                <span className="eyebrow">{range === 'This week' ? 'Top of the week' : range === 'This month' ? 'Top of the month' : 'All-time legends'}</span>
              </div>
              {/* Second, first, third: the winner stands in the middle. */}
              <div className="neon-podium">
                {second ? <Podium entry={second} place={2} score={points(second)} /> : <span />}
                {first && <Podium entry={first} place={1} score={points(first)} />}
                {third ? <Podium entry={third} place={3} score={points(third)} /> : <span />}
              </div>
            </section>

            <div className="stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
              {ranked.map((entry, index) => {
                const level = levelForLifetimePoints(entry.lifetimePoints);
                const isMe = entry.id === meId;
                return (
                  <article key={entry.id} className={`neon-rank${isMe ? ' is-me' : ''}`}>
                    <span className="neon-rank__number">
                      {index === 0 ? <Icon name="crown" size={18} className="neon-podium__crown" /> : null}#{index + 1}
                    </span>
                    <Avatar config={avatarOf(entry)} size={40} label={`${entry.displayName} avatar`} />
                    <span className="neon-rank__who">
                      <strong>
                        {entry.displayName}
                        {/* Said in words, not by the border alone. */}
                        {isMe && <span className="muted"> · you</span>}
                      </strong>
                      <span className="neon-rank__meta">
                        <span>
                          <Icon name="medal" size={14} />
                          Lvl {level.level}
                        </span>
                        <span>
                          <Icon name="flame" size={14} />
                          {entry.streakDays}d<span className="visually-hidden"> streak</span>
                        </span>
                        <span>
                          <Icon name="check" size={14} />
                          {entry.choresApproved} {entry.choresApproved === 1 ? 'chore' : 'chores'}
                        </span>
                      </span>
                    </span>
                    <span className="neon-rank__score">
                      <b>{points(entry).toLocaleString('en-US')}</b>
                      <span className="row" style={{ gap: 3 }}>
                        <Icon name="xp" size={13} /> XP
                      </span>
                    </span>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Podium({ entry, place, score }: { entry: StandingEntry; place: 1 | 2 | 3; score: number }) {
  const size = place === 1 ? 76 : 60;
  const level = levelForLifetimePoints(entry.lifetimePoints).level;
  return (
    <div className="neon-podium__slot">
      {/* Avatar draws the player's own equipped frame. */}
      <Avatar config={avatarOf(entry)} size={size} label={`${entry.displayName} avatar`} />
      <strong>{entry.displayName}</strong>
      <TierEmblem level={level} size={34} />
      <div className={`neon-podium__block neon-podium__block--${place}`}>
        <b>{place}</b>
        <span className="numeric">{score.toLocaleString('en-US')} XP</span>
      </div>
    </div>
  );
}
