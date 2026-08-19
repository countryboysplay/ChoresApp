import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ChoreResolution, DashboardResponse, UnresolvedChore } from '@chore-quest/shared';
import type { AvatarConfig } from '../../design/Avatar';
import { Avatar, DEFAULT_AVATAR } from '../../design/Avatar';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, EmptyState, PointsPill, Sheet, StatRow } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { InboxBell } from '../../components/InboxBell';
import { api, ApiRequestError } from '../../lib/api';

/**
 * The parent dashboard.
 *
 * "Needs attention" lists chores from a day that has passed which nobody
 * finished and nobody has decided about. They sit there until a parent picks
 * one of three outcomes - nothing here becomes `missed` by itself, because a
 * busy Tuesday should not cost a child their streak.
 */
export function ParentDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<UnresolvedChore | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard.load());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load the dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (outcome: ChoreResolution) => {
    if (!deciding) return;
    setWorking(true);
    try {
      await api.dashboard.resolve(deciding.id, outcome);
      setDeciding(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not work.');
    } finally {
      setWorking(false);
    }
  };

  if (loading || !data) {
    return (
      <main className="screen screen--wide">
        <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
          {error ?? 'Loading…'}
        </p>
      </main>
    );
  }

  const { counts } = data;

  return (
    <>
      <ScreenTop title="Home" trailing={<InboxBell to="/parent/notifications" />} />
      <main className="screen screen--wide">
        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        <section className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
          <StatRow
            icon="check"
            tone="green"
            label="Chores done this week"
            value={`${counts.choresDoneThisWeek} / ${counts.choresDueThisWeek}`}
          />
          <Link to="/parent/approvals" style={{ textDecoration: 'none', color: 'inherit' }}>
            <StatRow
              icon="inbox"
              tone="blue"
              label="Waiting for review"
              value={String(counts.pendingApprovals)}
            />
          </Link>
          <Link to="/parent/rewards" style={{ textDecoration: 'none', color: 'inherit' }}>
            <StatRow
              icon="gift"
              tone="purple"
              label="Reward requests"
              value={String(counts.pendingRewardRequests)}
            />
          </Link>
        </section>

        <section style={{ marginTop: 'var(--space-5)' }}>
          <h2 className="subtitle">Needs attention</h2>
          {data.needsAttention.length === 0 ? (
            <EmptyState
              icon="check"
              title="Nothing outstanding"
              message="Chores nobody finished on a past day show up here."
            />
          ) : (
            <div className="stack stack--tight">
              {data.needsAttention.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="card card--interactive card--status is-waiting row"
                  style={{ gap: 'var(--space-3)', textAlign: 'left' }}
                  onClick={() => setDeciding(item)}
                >
                  <span className="tile-icon tile-icon--gold tile-icon--sm">
                    <Icon name={item.choreIcon as IconName} size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, display: 'block' }}>
                      {item.choreName} not finished
                    </span>
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {item.child.displayName} ·{' '}
                      {new Date(`${item.choreDate}T12:00:00`).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </span>
                  <Badge tone="waiting">Decide</Badge>
                </button>
              ))}
            </div>
          )}
        </section>

        <section style={{ marginTop: 'var(--space-5)' }}>
          <h2 className="subtitle">The kids</h2>
          <div className="stack stack--tight">
            {data.children.map((child) => (
              <div key={child.id} className="card row" style={{ gap: 'var(--space-3)' }}>
                <Avatar
                  config={(child.avatar as AvatarConfig | null) ?? DEFAULT_AVATAR}
                  size={48}
                  label={`${child.displayName} avatar`}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 800, display: 'block' }}>{child.displayName}</span>
                  <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                    {child.weekPoints} points this week
                  </span>
                </span>
                <PointsPill value={child.balance} small />
              </div>
            ))}
          </div>
        </section>

        <div className="row" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
          <Button tone="quiet" block icon="plus" onClick={() => navigate('/parent/chores/new')}>
            New chore
          </Button>
          <Button tone="purple" block icon="star" onClick={() => navigate('/parent/bonus')}>
            Post a bonus
          </Button>
        </div>
      </main>

      {deciding && (
        <Sheet title={`${deciding.choreName} not finished`} onClose={() => setDeciding(null)}>
          <div className="stack">
            <p style={{ margin: 0 }}>
              {deciding.child.displayName} did not finish this on{' '}
              {new Date(`${deciding.choreDate}T12:00:00`).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
              .
            </p>

            <div className="stack stack--tight">
              <Button tone="quiet" block disabled={working} onClick={() => void resolve('excused')}>
                Excuse it
              </Button>
              <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                Nothing owed. The streak pauses rather than breaking.
              </span>
            </div>

            <div className="stack stack--tight">
              <Button tone="purple" block disabled={working} onClick={() => void resolve('carried_over')}>
                Carry it over to today
              </Button>
              <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                A fresh copy appears on today&apos;s list, still worth {deciding.points} points.
              </span>
            </div>

            <div className="stack stack--tight">
              <Button tone="stop" block disabled={working} onClick={() => void resolve('missed')}>
                Mark it missed
              </Button>
              <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                This is the only thing that breaks a streak.
              </span>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
