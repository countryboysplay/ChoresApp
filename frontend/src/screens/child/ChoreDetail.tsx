import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, CheckItem, Meter, PointsPill } from '../../design/primitives';
import { CameraCapture } from '../../components/CameraCapture';
import { ScreenTop } from '../../components/ScreenTop';
import { playSound } from '../../design/sound';
import { api, ApiRequestError } from '../../lib/api';
import { isSecureForCamera } from '../../lib/camera';
import type { CapturedPhoto } from '../../lib/camera';
import { useAuth } from '../../lib/auth';
import { useChildDay } from '../../lib/childDay';
import { StatusBadge } from './choreStatus';

type Phase = 'checklist' | 'camera' | 'review' | 'submitted';

export function ChoreDetail() {
  const { choreId = '' } = useParams();
  const { mode } = useAuth();
  const { day, loading, error, setSubtaskDone, reload } = useChildDay();
  const [phase, setPhase] = useState<Phase>('checklist');
  const [captured, setCaptured] = useState<CapturedPhoto | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Object URLs are not garbage collected on their own.
  useEffect(() => () => {
    if (captured) URL.revokeObjectURL(captured.previewUrl);
  }, [captured]);

  // Read from the day rather than fetching separately, so a tick here and the
  // progress ring on the home screen cannot disagree.
  const chore = useMemo(
    () => [...(day?.core ?? []), ...(day?.bonus ?? [])].find((entry) => entry.id === choreId) ?? null,
    [day, choreId],
  );

  if (loading && !chore) {
    return (
      <main className="screen">
        <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-7)' }}>
          Loading&hellip;
        </p>
      </main>
    );
  }

  if (!chore) {
    return (
      <>
        <ScreenTop title="Chore" back={-1} />
        <main className="screen">
          <div className="card card--status is-late">
            <p style={{ fontWeight: 700, margin: 0 }}>
              {error ?? 'That chore is not on today’s list.'}
            </p>
          </div>
        </main>
      </>
    );
  }

  const submit = async () => {
    if (!captured || uploading) return;
    setUploading(true);
    setSubmitError(null);
    try {
      // Preview mode has no server; the flow still demonstrates end to end.
      if (mode !== 'preview') {
        await api.chores.addPhoto(chore.id, captured.blob);
        await api.chores.submit(chore.id);
        await reload();
      }
      playSound('approve');
      setPhase('submitted');
    } catch (caught) {
      setSubmitError(
        caught instanceof ApiRequestError ? caught.message : 'That could not be sent. Try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  const wasRejected = chore.status === 'rejected';
  const doneCount = chore.subtasks.filter((task) => task.done).length;
  const allDone = chore.subtasks.length > 0 && doneCount === chore.subtasks.length;
  // A finished chore is a record. Only a parent sending it back reopens it.
  const locked = !['not_started', 'in_progress', 'rejected'].includes(chore.status);

  return (
    <>
      <ScreenTop title={chore.name} back={-1} />
      <main className="screen">
        <section className="panel panel--sky" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
            <span className="eyebrow">{chore.kind === 'bonus' ? 'Bonus chore' : 'Required chore'}</span>
            <PointsPill value={chore.points} small />
          </div>
          <div className="row" style={{ gap: 'var(--space-4)' }}>
            <span
              className="tile-icon"
              style={{ width: 68, height: 68, borderRadius: 20, background: 'rgba(255,255,255,0.22)' }}
            >
              <Icon name={chore.icon as IconName} size={34} />
            </span>
            <div style={{ flex: 1 }}>
              <h2 className="title" style={{ fontSize: 'var(--text-xl)' }}>
                {chore.name}
              </h2>
              <StatusBadge status={phase === 'submitted' ? 'submitted' : chore.status} />
            </div>
          </div>
        </section>

        {wasRejected && phase !== 'submitted' && (
          <div className="card card--status is-late" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
              <Icon name="alert" size={20} />
              <strong>A parent sent this back</strong>
            </div>
            <p style={{ margin: 0 }}>{chore.rejectionNote}</p>
            <p className="muted" style={{ marginBottom: 0, fontSize: 'var(--text-sm)' }}>
              Check everything again and take a new photo.
            </p>
          </div>
        )}

        {phase === 'submitted' ? (
          <SubmittedState choreName={chore.name} />
        ) : (
          <>
            <section className="stack stack--tight">
              <div className="meter-label">
                <span>Checklist</span>
                <span className="numeric">
                  {doneCount} of {chore.subtasks.length}
                </span>
              </div>
              <Meter value={doneCount} max={Math.max(chore.subtasks.length, 1)} tone="green" />

              {chore.subtasks.map((task) => (
                <CheckItem
                  key={task.id}
                  title={task.title}
                  instruction={task.instruction ?? undefined}
                  checked={task.done}
                  disabled={phase !== 'checklist' || locked}
                  onToggle={() => void setSubtaskDone(chore.id, task.id, !task.done)}
                />
              ))}
            </section>

            <section style={{ marginTop: 'var(--space-5)' }}>
              <h2 className="subtitle">Photo proof</h2>

              {!allDone && (
                <div className="card row" style={{ gap: 'var(--space-3)' }}>
                  <Icon name="lock" size={22} />
                  <p style={{ margin: 0 }} className="muted">
                    Finish every step to unlock the camera.
                  </p>
                </div>
              )}

              {allDone && phase === 'checklist' && (
                <div className="card stack">
                  <p style={{ margin: 0 }}>
                    Take a live photo of your finished work. Saved pictures cannot be used.
                  </p>
                  {isSecureForCamera() ? (
                    <Button
                      tone="purple"
                      size="lg"
                      block
                      icon="camera"
                      sound="tap"
                      onClick={() => setPhase('camera')}
                    >
                      Open camera
                    </Button>
                  ) : (
                    // Browsers only give out the camera over https or on
                    // localhost, so opening the dev server by its wifi address
                    // can never work. Say why instead of failing on tap.
                    <div className="row" style={{ gap: 'var(--space-3)' }}>
                      <Icon name="lock" size={22} />
                      <p style={{ margin: 0 }} className="muted">
                        The camera needs a secure connection. Open Chore Quest on the laptop, or
                        wait for the household web address to be set up.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {allDone && phase === 'camera' && (
                <CameraCapture
                  onCaptured={(photo) => {
                    setCaptured(photo);
                    setPhase('review');
                  }}
                  onCancel={() => setPhase('checklist')}
                />
              )}

              {allDone && phase === 'review' && captured && (
                <div className="card stack">
                  <img
                    src={captured.previewUrl}
                    alt="The photo you just took"
                    style={{
                      width: '100%',
                      aspectRatio: '4 / 3',
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--outline)',
                      display: 'block',
                    }}
                  />

                  {submitError && (
                    <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
                      {submitError}
                    </p>
                  )}

                  <div className="row" style={{ gap: 'var(--space-3)' }}>
                    <Button
                      tone="quiet"
                      block
                      disabled={uploading}
                      onClick={() => {
                        URL.revokeObjectURL(captured.previewUrl);
                        setCaptured(null);
                        setPhase('camera');
                      }}
                    >
                      Retake
                    </Button>
                    <Button tone="go" size="lg" block disabled={uploading} onClick={() => void submit()}>
                      {uploading
                        ? 'Sending…'
                        : wasRejected
                          ? 'Fix and resubmit'
                          : 'Submit for approval'}
                    </Button>
                  </div>
                </div>
              )}

            </section>
          </>
        )}
      </main>
    </>
  );
}

function SubmittedState({ choreName }: { choreName: string }) {
  return (
    <div
      className="panel panel--sky celebrate"
      style={{ textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 'var(--space-3)' }}
    >
      <Confetti />
      <h2 className="title" style={{ fontSize: 'var(--text-2xl)' }}>
        Great job!
      </h2>
      <p style={{ margin: 0, fontWeight: 700 }}>You submitted {choreName}</p>
      <span className="badge badge--waiting" style={{ fontSize: 'var(--text-sm)' }}>
        <Icon name="clock" size={16} /> Pending approval
      </span>
      <p style={{ margin: 0, fontSize: 'var(--text-sm)', opacity: 0.9 }}>
        Points arrive once a parent approves it.
      </p>
    </div>
  );
}

function Confetti() {
  const pieces = [
    { x: 8, y: 10, color: 'var(--gold)' },
    { x: 26, y: 4, color: 'var(--green)' },
    { x: 48, y: 12, color: '#fff' },
    { x: 70, y: 3, color: 'var(--purple)' },
    { x: 88, y: 14, color: 'var(--red)' },
    { x: 16, y: 30, color: 'var(--purple)' },
    { x: 82, y: 34, color: 'var(--green)' },
  ];
  return (
    <svg viewBox="0 0 100 44" style={{ width: '100%', maxWidth: 260 }} aria-hidden="true">
      {pieces.map((piece, index) => (
        <rect
          key={index}
          x={piece.x}
          y={piece.y}
          width="5"
          height="8"
          rx="1.5"
          fill={piece.color}
          transform={`rotate(${index * 37} ${piece.x + 2.5} ${piece.y + 4})`}
        />
      ))}
    </svg>
  );
}
