import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../design/icons';
import { Badge, Button, EmptyState, PointsPill, Segmented, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { relativeTime } from '../../config/format';
import { pendingSubmissions } from '../../mock/data';

/**
 * Approve All is disabled until every thumbnail in the queue has been opened in
 * this session - the spec's safety rule against rubber-stamping unseen photos.
 */
const TABS = ['Pending', 'Reviewed'] as const;

export function ApprovalQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Pending');
  const [viewed, setViewed] = useState<string[]>([]);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const byChild = pendingSubmissions.reduce<Record<string, typeof pendingSubmissions>>((groups, item) => {
    (groups[item.child] ??= []).push(item);
    return groups;
  }, {});

  const allViewed = pendingSubmissions.every((item) => viewed.includes(item.id));

  return (
    <>
      <ScreenTop
        title="Approvals"
        trailing={<Badge tone="waiting">{pendingSubmissions.length} pending</Badge>}
      />
      <main className="screen screen--wide">
        <Segmented options={TABS} value={tab} onChange={setTab} label="Approval queue" />

        {tab === 'Reviewed' ? (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <EmptyState
              icon="check"
              title="Nothing reviewed yet today"
              message="Approved and rejected chores from the last 30 days show up here."
            />
          </div>
        ) : pendingSubmissions.length === 0 ? (
          <EmptyState icon="check" title="All caught up" message="No submissions are waiting." />
        ) : (
          <>
            {Object.entries(byChild).map(([child, items]) => (
              <section key={child} style={{ margin: 'var(--space-5) 0' }}>
                <h2 className="subtitle">{child}</h2>
                <div className="stack stack--tight">
                  {items.map((item) => (
                    <article key={item.id} className="card row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        aria-label={`View photo for ${item.choreName}`}
                        onClick={() => {
                          setViewed((current) =>
                            current.includes(item.id) ? current : [...current, item.id],
                          );
                          setLightbox(item.id);
                        }}
                        style={{
                          width: 68,
                          height: 68,
                          borderRadius: 'var(--radius-md)',
                          border: viewed.includes(item.id)
                            ? '2px solid var(--green)'
                            : '2px solid var(--outline)',
                          background:
                            'repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 8px, rgba(255,255,255,0.02) 8px 16px)',
                          color: 'var(--text-muted)',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name="camera" size={22} />
                      </button>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: 'block' }}>{item.choreName}</strong>
                        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                          {item.subtasksDone}/{item.subtasksTotal} subtasks · {item.photos} photo
                          {item.photos > 1 ? 's' : ''} · {relativeTime(item.minutesAgo)}
                        </span>
                        <div className="row" style={{ gap: 'var(--space-2)', marginTop: 6 }}>
                          <PointsPill value={item.points} small />
                          {viewed.includes(item.id) ? (
                            <Badge tone="done" icon="check">
                              Photo viewed
                            </Badge>
                          ) : (
                            <Badge tone="neutral">Not reviewed</Badge>
                          )}
                        </div>
                      </div>

                      <span className="row" style={{ gap: 'var(--space-2)' }}>
                        <Button
                          size="sm"
                          tone="go"
                          sound="approve"
                          onClick={() => navigate(`/parent/approvals/${item.id}`)}
                        >
                          Approve
                        </Button>
                        <Button size="sm" tone="stop" onClick={() => navigate(`/parent/approvals/${item.id}`)}>
                          Reject
                        </Button>
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            ))}

            <Button
              tone="go"
              size="lg"
              block
              disabled={!allViewed}
              onClick={() => setConfirmBulk(true)}
            >
              Approve all ({pendingSubmissions.length})
            </Button>
            {!allViewed && (
              <p className="muted" style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>
                Open every photo first. Approve All stays locked until you have seen them all.
              </p>
            )}
          </>
        )}
      </main>

      {lightbox && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Submitted photo"
          style={{ alignItems: 'center' }}
          onClick={() => setLightbox(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 720,
              aspectRatio: '4 / 3',
              borderRadius: 'var(--radius-lg)',
              background:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 18px, rgba(255,255,255,0.03) 18px 36px)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <p style={{ fontSize: 'var(--text-sm)' }}>Tap anywhere to close</p>
          </div>
        </div>
      )}

      {confirmBulk && (
        <Sheet
          title="Approve everything?"
          onClose={() => setConfirmBulk(false)}
          footer={
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <Button tone="quiet" block onClick={() => setConfirmBulk(false)}>
                Cancel
              </Button>
              <Button tone="go" block sound="approve" onClick={() => setConfirmBulk(false)}>
                Approve all
              </Button>
            </div>
          }
        >
          <p style={{ marginTop: 0 }}>
            This approves {pendingSubmissions.length} submissions and awards their points at once.
          </p>
        </Sheet>
      )}
    </>
  );
}
