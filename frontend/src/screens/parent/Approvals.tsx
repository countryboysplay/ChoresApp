import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Submission } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { NeonArt } from '../../design/neon';
import { Badge, Button, EmptyState, PointsPill, Segmented, SelectField } from '../../design/primitives';
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
  const [childFilter, setChildFilter] = useState('');
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

  // Children come from the queue itself, so the filter only offers someone with something in it.
  const kids = [...new Map([...pending, ...reviewed].map((item) => [item.child.id, item.child.displayName])).entries()];
  // A child whose last item left the queue falls back to everyone.
  const activeChild = kids.some(([id]) => id === childFilter) ? childFilter : '';
  const list = (tab === 'Pending' ? pending : reviewed).filter((item) => !activeChild || item.child.id === activeChild);

  return (
    <>
      <ScreenTop title="Approvals" />
      <main className="screen screen--wide">
        <Segmented options={TABS} value={tab} onChange={setTab} label="Queue" />

        {kids.length > 1 && (
          <div className="toolbar">
            <SelectField
              icon="filter"
              label="Filter by child"
              value={activeChild}
              onChange={setChildFilter}
              options={[{ value: '', label: 'Every child' }, ...kids.map(([value, label]) => ({ value, label }))]}
            />
          </div>
        )}

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
            {tab === 'Pending' ? (
              <EmptyState
                icon="check"
                title="Nothing waiting"
                message="Chores appear here as soon as they are sent in."
              />
            ) : (
              <div className="empty">
                <NeonArt group="states" name="no-history" style={{ width: 160, height: 'auto' }} />
                <h3 className="subtitle">Nothing reviewed yet today</h3>
                <p style={{ margin: 0 }}>Approved and returned chores from today will show here.</p>
              </div>
            )}
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
                    <Icon name="photo" size={14} style={{ verticalAlign: '-2px' }} /> {item.photos.length} photo{item.photos.length === 1 ? '' : 's'}
                    {item.submittedAt ? ` · ${relativeTime(minutesSince(item.submittedAt))}` : ''}
                  </span>
                  <span style={{ display: 'inline-flex', gap: 'var(--space-2)', marginTop: 6 }}>
                    {item.status === 'submitted' ? (
                      item.photos.every((photo) => photo.viewed) ? (
                        <Badge tone="done" icon="eye">Photo viewed</Badge>
                      ) : (
                        <Badge tone="neutral" icon="eye-off">Not reviewed</Badge>
                      )
                    ) : item.status === 'approved' ? (
                      <Badge tone="done" icon="approve">Approved</Badge>
                    ) : (
                      <Badge tone="late" icon="reject">Sent back</Badge>
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
              icon="approve"
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
