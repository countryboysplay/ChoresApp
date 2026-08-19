import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../design/icons';
import { Button, PointsPill, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { relativeTime } from '../../config/format';
import { pendingSubmissions } from '../../mock/data';

export function ApprovalReview() {
  const { submissionId = '' } = useParams();
  const navigate = useNavigate();
  const submission = pendingSubmissions.find((item) => item.id === submissionId) ?? pendingSubmissions[0]!;

  const [fullscreen, setFullscreen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  return (
    <>
      <ScreenTop title="Review" back="/parent/approvals" />
      <main className="screen">
        <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
          <div className="row">
            <span className="tile-icon tile-icon--gold">
              <Icon name={submission.choreIcon} size={24} />
            </span>
            <div>
              <strong style={{ display: 'block' }}>{submission.choreName}</strong>
              <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                {submission.child} · {relativeTime(submission.minutesAgo)}
              </span>
            </div>
          </div>
          <PointsPill value={submission.points} small />
        </div>

        <button
          type="button"
          onClick={() => setFullscreen(true)}
          aria-label="Open photo full screen"
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--outline)',
            background:
              'repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 14px, rgba(255,255,255,0.02) 14px 28px)',
            color: 'var(--text-muted)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <Icon name="camera" size={34} />
            <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>Tap to view full screen</p>
          </div>
        </button>

        <section className="card" style={{ marginTop: 'var(--space-4)' }}>
          <h2 className="subtitle">Checklist</h2>
          <div className="stack stack--tight">
            {Array.from({ length: submission.subtasksTotal }).map((_, index) => (
              <div key={index} className="row" style={{ gap: 'var(--space-3)' }}>
                <span style={{ color: 'var(--green)' }}>
                  <Icon name="check" size={18} />
                </span>
                <span className="muted">Subtask {index + 1} completed</span>
              </div>
            ))}
          </div>
        </section>

        <div className="row" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
          <Button tone="stop" size="lg" block onClick={() => setRejecting(true)}>
            Reject
          </Button>
          <Button
            tone="go"
            size="lg"
            block
            sound="approve"
            onClick={() => navigate('/parent/approvals')}
          >
            Approve
          </Button>
        </div>
        <p className="muted" style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>
          Approving opens the next submission automatically.
        </p>
      </main>

      {fullscreen && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Photo"
          onClick={() => setFullscreen(false)}
          style={{ alignItems: 'center' }}
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
            <p style={{ fontSize: 'var(--text-sm)' }}>Pinch to zoom (Stage 7)</p>
          </div>
        </div>
      )}

      {rejecting && (
        <Sheet
          title="Send this back"
          onClose={() => setRejecting(false)}
          footer={
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <Button tone="quiet" block onClick={() => setRejecting(false)}>
                Cancel
              </Button>
              <Button
                tone="stop"
                block
                disabled={note.trim().length === 0}
                onClick={() => {
                  setRejecting(false);
                  navigate('/parent/approvals');
                }}
              >
                Reject
              </Button>
            </div>
          }
        >
          <label className="field">
            <span className="field__label">What needs fixing?</span>
            <textarea
              className="textarea"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Example: the stove is still greasy, please wipe it again."
            />
          </label>
          <p className="muted" style={{ marginBottom: 0, fontSize: 'var(--text-sm)' }}>
            A note is required. {submission.child} sees it and takes a new photo.
          </p>
        </Sheet>
      )}
    </>
  );
}
