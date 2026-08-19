import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '../../design/icons';
import { Badge, Button, CheckItem, Meter, PointsPill } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { playSound } from '../../design/sound';
import { bonusChores, coreChores, type Chore } from '../../mock/data';
import { StatusBadge } from './choreStatus';

type Phase = 'checklist' | 'camera' | 'review' | 'ready' | 'submitted';

const ALL: Chore[] = [...coreChores, ...bonusChores];

export function ChoreDetail() {
  const { choreId = '' } = useParams();
  const chore = ALL.find((entry) => entry.id === choreId) ?? ALL[0]!;
  const wasRejected = chore.status === 'rejected';

  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(chore.subtasks.map((task) => [task.id, wasRejected ? false : task.done])),
  );
  const [phase, setPhase] = useState<Phase>('checklist');

  const doneCount = useMemo(() => Object.values(checked).filter(Boolean).length, [checked]);
  const allDone = doneCount === chore.subtasks.length;

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
              <Icon name={chore.icon} size={34} />
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
              <Meter value={doneCount} max={chore.subtasks.length} tone="green" />

              {chore.subtasks.map((task) => (
                <CheckItem
                  key={task.id}
                  title={task.title}
                  instruction={task.instruction}
                  checked={Boolean(checked[task.id])}
                  disabled={phase !== 'checklist'}
                  onToggle={() =>
                    setChecked((current) => ({ ...current, [task.id]: !current[task.id] }))
                  }
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
                </div>
              )}

              {allDone && phase === 'camera' && <CameraPlaceholder onCapture={() => setPhase('review')} />}

              {allDone && (phase === 'review' || phase === 'ready') && (
                <div className="card stack">
                  <div
                    style={{
                      aspectRatio: '4 / 3',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--outline)',
                      background:
                        'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 12px, rgba(255,255,255,0.02) 12px 24px)',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <div style={{ textAlign: 'center' }}>
                      <Icon name="camera" size={32} />
                      <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>Captured photo preview</p>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 'var(--space-3)' }}>
                    <Button tone="quiet" block onClick={() => setPhase('camera')}>
                      Retake
                    </Button>
                    <Button tone="go" block sound="success" onClick={() => setPhase('ready')}>
                      Use photo
                    </Button>
                  </div>
                  {phase === 'ready' && (
                    <>
                      <Badge tone="done" icon="check">
                        1 photo attached
                      </Badge>
                      <Button
                        tone="go"
                        size="lg"
                        block
                        sound="approve"
                        onClick={() => {
                          playSound('approve');
                          setPhase('submitted');
                        }}
                      >
                        {wasRejected ? 'Fix and resubmit' : 'Submit for approval'}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

/**
 * Stage 6 replaces this with a real getUserMedia preview. The permission-denied
 * copy is shown here on purpose so it gets reviewed now: when live camera is
 * unavailable, submission stays blocked and there is no gallery fallback.
 */
function CameraPlaceholder({ onCapture }: { onCapture: () => void }) {
  const [denied, setDenied] = useState(false);

  return (
    <div className="card stack">
      <div
        style={{
          aspectRatio: '4 / 3',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid var(--outline)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-muted)',
          textAlign: 'center',
          padding: 'var(--space-4)',
        }}
      >
        {denied ? (
          <div>
            <Icon name="alert" size={32} />
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>Camera is blocked</p>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              Allow camera access in your browser settings, then try again. You cannot upload a
              saved picture instead.
            </p>
          </div>
        ) : (
          <div>
            <Icon name="camera" size={32} />
            <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>Live camera preview (Stage 6)</p>
          </div>
        )}
      </div>

      <Button tone="purple" size="lg" block icon="camera" disabled={denied} onClick={onCapture}>
        Capture
      </Button>
      <Button tone="quiet" size="sm" block onClick={() => setDenied((value) => !value)}>
        Preview the camera-blocked state
      </Button>
    </div>
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
