import { useCallback, useEffect, useState } from 'react';
import type { StandingEntry } from '@chore-quest/shared';
import type { AvatarConfig } from '../../design/Avatar';
import { Avatar, DEFAULT_AVATAR } from '../../design/Avatar';
import { Icon } from '../../design/icons';
import { EmptyState, PointsPill, Segmented, Tile } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { levelForLifetimePoints } from '../../config/levels';
import { api, ApiRequestError } from '../../lib/api';

const RANGE = ['This week', 'All time'] as const;

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
    range === 'This week' ? entry.weekPoints : entry.lifetimePoints;

  const ranked = [...entries].sort(
    (a, b) =>
      points(b) - points(a) ||
      b.streakDays - a.streakDays ||
      a.displayName.localeCompare(b.displayName),
  );
  const [first, second] = ranked;

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
            <section className="panel panel--navy" style={{ marginTop: 'var(--space-4)' }}>
              <div
                className="row"
                style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 'var(--space-5)' }}
              >
                {second && <Podium entry={second} place={2} />}
                {first && <Podium entry={first} place={1} />}
              </div>
            </section>

            <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
              {ranked.map((entry, index) => {
                const level = levelForLifetimePoints(entry.lifetimePoints);
                const isMe = entry.id === meId;
                return (
                  <article
                    key={entry.id}
                    className="card stack stack--tight"
                    style={
                      isMe
                        ? { borderColor: 'var(--outline-strong)', borderWidth: 2, borderStyle: 'solid' }
                        : undefined
                    }
                  >
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
                      <Avatar
                        config={avatarOf(entry)}
                        size={48}
                        label={`${entry.displayName} avatar`}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: 'block' }}>
                          {entry.displayName}
                          {/* Said in words, not by the border alone. */}
                          {isMe && <span className="muted"> · you</span>}
                        </strong>
                        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                          Level {level.level}
                        </span>
                      </span>
                      <PointsPill value={points(entry)} small />
                    </div>

                    <div className="grid-2">
                      <Tile value={entry.weekPoints} label="Points this week" />
                      <Tile value={entry.lifetimePoints} label="Points all time" />
                      <Tile
                        value={
                          <span className="row" style={{ justifyContent: 'center', gap: 4 }}>
                            <Icon name="flame" size={18} />
                            {entry.streakDays}
                          </span>
                        }
                        label="Day streak"
                      />
                      <Tile value={entry.choresApproved} label="Chores done" />
                    </div>
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

function Podium({ entry, place }: { entry: StandingEntry; place: 1 | 2 }) {
  const height = place === 1 ? 92 : 64;
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-2)' }}>
      <Avatar
        config={avatarOf(entry)}
        size={place === 1 ? 76 : 60}
        label={`${entry.displayName} avatar`}
      />
      <strong>{entry.displayName}</strong>
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
