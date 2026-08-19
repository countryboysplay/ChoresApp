import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SubmissionDetail } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, PointsPill, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';

/**
 * One submission, reviewed.
 *
 * The photo is loaded as soon as this screen opens, which is what marks it seen
 * on the server - so reaching this screen is what unlocks approval, both here
 * and for Approve All back in the queue.
 */
export function ApprovalReview() {
  const { submissionId = '' } = useParams();
  const navigate = useNavigate();

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [fullScreenPhoto, setFullScreenPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.approvals.get(submissionId);
      setSubmission(response.submission);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load that.');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async () => {
    setWorking(true);
    try {
      await api.approvals.approve(submissionId);
      navigate('/parent/approvals', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not work.');
      setWorking(false);
    }
  };

  const reject = async () => {
    setWorking(true);
    try {
      await api.approvals.reject(submissionId, note.trim());
      navigate('/parent/approvals', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not work.');
      setWorking(false);
      setRejecting(false);
    }
  };

  if (loading) {
    return (
      <>
        <ScreenTop title="Review" back={-1} />
        <main className="screen">
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            Loading&hellip;
          </p>
        </main>
      </>
    );
  }

  if (!submission) {
    return (
      <>
        <ScreenTop title="Review" back={-1} />
        <main className="screen">
          <div className="card card--status is-late">
            <p style={{ fontWeight: 700, margin: 0 }}>{error ?? 'That submission is gone.'}</p>
          </div>
        </main>
      </>
    );
  }

  const decided = submission.status !== 'submitted';
  const total = submission.pointsValue + submission.bonusPoints;

  return (
    <>
      <ScreenTop title={submission.choreName} back={-1} />
      <main className="screen">
        <section className="card row" style={{ gap: 'var(--space-3)' }}>
          <span className="tile-icon tile-icon--gold">
            <Icon name={submission.choreIcon as IconName} size={24} />
          </span>
          <div style={{ flex: 1 }}>
            <h2 className="subtitle" style={{ marginBottom: 4 }}>
              {submission.child.displayName}
            </h2>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <PointsPill value={total} small />
              {submission.punctual ? (
                <Badge tone="bonus">On time · +{submission.bonusPoints}</Badge>
              ) : (
                <Badge tone="neutral">After the reminder</Badge>
              )}
            </div>
          </div>
        </section>

        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            {error}
          </p>
        )}

        <section style={{ marginTop: 'var(--space-5)' }}>
          <h2 className="subtitle">Photo proof</h2>
          <div className="stack stack--tight">
            {submission.photos.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>No photo was attached.</p>
            )}
            {submission.photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
                aria-label={`Open photo full screen for ${submission.choreName}`}
                onClick={() => setFullScreenPhoto(photo.id)}
              >
                <img
                  src={api.approvals.photoUrl(photo.id)}
                  alt={`Proof for ${submission.choreName}`}
                  loading="eager"
                  style={{
                    width: '100%',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--outline)',
                    display: 'block',
                  }}
                />
              </button>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 'var(--space-5)' }}>
          <h2 className="subtitle">Checklist</h2>
          <div className="stack stack--tight">
            {submission.subtasks.map((subtask) => (
              <div key={subtask.id} className="card row" style={{ gap: 'var(--space-3)' }}>
                <Icon
                  name={subtask.done ? 'check' : 'close'}
                  size={20}
                  style={{ color: subtask.done ? 'var(--green)' : 'var(--text-muted)' }}
                />
                <span style={{ flex: 1 }}>{subtask.title}</span>
              </div>
            ))}
          </div>
        </section>

        {decided ? (
          <div className="card card--status is-info" style={{ marginTop: 'var(--space-5)' }}>
            <p style={{ margin: 0, fontWeight: 700 }}>
              {submission.status === 'approved' ? 'Already approved.' : 'Already sent back.'}
            </p>
          </div>
        ) : (
          <div className="row" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
            <Button tone="stop" size="lg" block disabled={working} onClick={() => setRejecting(true)}>
              Send back
            </Button>
            <Button tone="go" size="lg" block disabled={working} onClick={() => void approve()}>
              {working ? 'Saving…' : `Approve · ${total} pts`}
            </Button>
          </div>
        )}
      </main>

      {fullScreenPhoto && (
        <Sheet title="Submitted photo" onClose={() => setFullScreenPhoto(null)}>
          <img
            src={api.approvals.photoUrl(fullScreenPhoto)}
            alt={`Proof for ${submission.choreName}`}
            style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }}
          />
        </Sheet>
      )}

      {rejecting && (
        <Sheet title="Send it back" onClose={() => setRejecting(false)}>
          <div className="stack">
            <p style={{ margin: 0 }}>
              Say what needs fixing. {submission.child.displayName} sees this, and the checklist is
              cleared so every step gets checked again.
            </p>
            <textarea
              className="textarea"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Example: the stove is still greasy, please wipe it again."
              aria-label="What needs fixing"
              rows={3}
            />
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <Button tone="quiet" block onClick={() => setRejecting(false)}>
                Cancel
              </Button>
              <Button
                tone="stop"
                block
                disabled={note.trim().length === 0 || working}
                onClick={() => void reject()}
              >
                Send back
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
