import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Submission } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, EmptyState, PointsPill, Segmented } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { relativeTime } from '../../config/format';
import { api, ApiRequestError } from '../../lib/api';

const TABS = ['Pending', 'Reviewed'] as const;

/**
 * The approval queue.
 *
 * Approve All stays disabled until every photo in the queue has been opened -
 * the specification's rule against rubber-stamping work nobody looked at. The
 * server enforces the same rule, so this is the courtesy version: it explains
 * the block rather than letting the request fail.
 */
export function ApprovalQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Pending');
  const [pending, setPending] = useState<Submission[]>([]);
  const [reviewed, setReviewed] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const queue = await api.approvals.queue();
      setPending(queue.pending);
      setReviewed(queue.reviewed);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load the queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allViewed =
    pending.length > 0 && pending.every((item) => item.photos.every((photo) => photo.viewed));

  const approveAll = async () => {
    setWorking(true);
    try {
      const result = await api.approvals.approveAll();
      if (result.skipped.length > 0) {
        setError(`${result.approved} approved. ${result.skipped.length} could not be.`);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not work.');
    } finally {
      setWorking(false);
    }
  };

  const list = tab === 'Pending' ? pending : reviewed;

  return (
    <>
      <ScreenTop title="Approvals" />
      <main className="screen screen--wide">
        <Segmented options={TABS} value={tab} onChange={setTab} label="Queue" />

        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            {error}
          </p>
        )}

        {loading ? (
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            Loading&hellip;
          </p>
        ) : list.length === 0 ? (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <EmptyState
              icon="check"
              title={tab === 'Pending' ? 'Nothing waiting' : 'Nothing reviewed yet today'}
              message={
                tab === 'Pending'
                  ? 'Chores appear here as soon as they are sent in.'
                  : 'Approved and returned chores from today will show here.'
              }
            />
          </div>
        ) : (
          <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
            {list.map((item) => (
              <button
                key={item.id}
                type="button"
                className="card card--interactive row"
                style={{ gap: 'var(--space-3)', textAlign: 'left' }}
                onClick={() => navigate(`/parent/approvals/${item.id}`)}
              >
                <span className="tile-icon tile-icon--gold tile-icon--sm">
                  <Icon name={item.choreIcon as IconName} size={20} />
                </span>

                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 800, display: 'block' }}>{item.choreName}</span>
                  <span className="muted" style={{ fontSize: 'var(--text-sm)', display: 'block' }}>
                    {item.child.displayName} · {item.subtasksDone}/{item.subtasksTotal} steps ·{' '}
                    {item.photos.length} photo{item.photos.length === 1 ? '' : 's'}
                    {item.submittedAt ? ` · ${relativeTime(minutesSince(item.submittedAt))}` : ''}
                  </span>
                  <span style={{ display: 'inline-flex', gap: 'var(--space-2)', marginTop: 6 }}>
                    {item.status === 'submitted' ? (
                      item.photos.every((photo) => photo.viewed) ? (
                        <Badge tone="done" icon="check">Photo viewed</Badge>
                      ) : (
                        <Badge tone="neutral">Not reviewed</Badge>
                      )
                    ) : item.status === 'approved' ? (
                      <Badge tone="done" icon="check">Approved</Badge>
                    ) : (
                      <Badge tone="late" icon="alert">Sent back</Badge>
                    )}
                    {item.punctual && <Badge tone="bonus">On time</Badge>}
                  </span>
                </span>

                <PointsPill value={item.pointsAwarded ?? item.pointsValue} small />
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
        )}

        {tab === 'Pending' && pending.length > 0 && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            {!allViewed && (
              <p className="muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
                Open every photo before approving them all at once.
              </p>
            )}
            <Button
              tone="go"
              size="lg"
              block
              disabled={!allViewed || working}
              onClick={() => void approveAll()}
            >
              {working ? 'Approving…' : `Approve all (${pending.length})`}
            </Button>
          </div>
        )}
      </main>
    </>
  );
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}
