import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, PointsPill, Segmented } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { countdown } from '../../config/format';
import { api, ApiRequestError } from '../../lib/api';
import { useChildDay } from '../../lib/childDay';
import { StatusBadge } from './choreStatus';

const RANGE = ['Today', 'This week'] as const;
const SORTS = ['Highest points', 'Newest', 'Expiring soon'] as const;

/** Minutes from now until an ISO timestamp, for the countdown label. */
function minutesUntil(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

export function Missions() {
  const navigate = useNavigate();
  const { day, loading, error, reload } = useChildDay();
  const [range, setRange] = useState<(typeof RANGE)[number]>('Today');
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Highest points');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // A child holds one unfinished bonus at a time, so the board tells them why
  // the other Claim buttons are off rather than just disabling them.
  const holding = (day?.bonus ?? []).find(
    (chore) => !['approved', 'submitted'].includes(chore.status),
  );

  const claim = async (instanceId: string) => {
    setBusyId(instanceId);
    setClaimError(null);
    try {
      await api.bonus.claim(instanceId);
      await reload();
    } catch (caught) {
      setClaimError(caught instanceof ApiRequestError ? caught.message : 'That did not work.');
      // Someone else may have taken it a moment ago; refresh either way.
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const release = async (instanceId: string) => {
    setBusyId(instanceId);
    setClaimError(null);
    try {
      await api.bonus.release(instanceId);
      await reload();
    } catch (caught) {
      setClaimError(caught instanceof ApiRequestError ? caught.message : 'That did not work.');
    } finally {
      setBusyId(null);
    }
  };

  const required = day?.core ?? [];
  const core = required[0] ?? null;

  // The board is what is on offer plus anything this child already claimed, so
  // a claimed chore does not vanish from the screen it was claimed on.
  const board = useMemo(() => {
    const list = [...(day?.availableBonus ?? []), ...(day?.bonus ?? [])];
    if (sort === 'Highest points') list.sort((a, b) => b.points - a.points);
    if (sort === 'Expiring soon')
      list.sort(
        (a, b) =>
          (minutesUntil(a.expiresAt) ?? Infinity) - (minutesUntil(b.expiresAt) ?? Infinity),
      );
    return list;
  }, [day, sort]);

  if (loading && !day) {
    return (
      <>
        <ScreenTop title="Missions" />
        <main className="screen">
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            Loading&hellip;
          </p>
        </main>
      </>
    );
  }

  if (!day) {
    return (
      <>
        <ScreenTop title="Missions" />
        <main className="screen">
          <div className="card card--status is-late">
            <p style={{ fontWeight: 700, margin: 0 }}>{error ?? 'Could not load missions.'}</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <ScreenTop title="Missions" />
      <main className="screen">
        <Segmented options={RANGE} value={range} onChange={setRange} label="Time range" />

        <section style={{ marginTop: 'var(--space-5)' }}>
          <span className="eyebrow">Required chores</span>

          {range === 'This week' && (
            // Honest rather than quietly showing today's list twice. The
            // week view needs a range query the API does not have yet.
            <p className="muted" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              The week view is not built yet. Showing today.
            </p>
          )}

          {required.length === 0 && (
            <p className="muted" style={{ marginTop: 'var(--space-3)' }}>Nothing due today.</p>
          )}

          <div className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
            {required.map((chore) => {
              const done = chore.subtasks.filter((task) => task.done).length;
              return (
                <button
                  key={chore.id}
                  type="button"
                  className="card card--interactive row"
                  onClick={() => navigate(`/child/chore/${chore.id}`)}
                >
                  <span className="tile-icon tile-icon--gold tile-icon--sm">
                    <Icon name={chore.icon as IconName} size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, display: 'block' }}>{chore.name}</span>
                    <span className="muted numeric" style={{ fontSize: 'var(--text-sm)' }}>
                      {done} of {chore.subtasks.length} steps
                    </span>
                  </span>
                  <PointsPill value={chore.points} small />
                  <StatusIcon done={done === chore.subtasks.length} />
                </button>
              );
            })}
          </div>
          {core && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <StatusBadge status={core.status} />
            </div>
          )}
        </section>

        <section style={{ marginTop: 'var(--space-5)' }}>
          <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
            <span className="eyebrow">Bonus chores</span>
            <Badge tone="bonus">{board.filter((chore) => !chore.claimed).length} open</Badge>
          </div>

          <div className="chip-row" role="group" aria-label="Sort bonus chores">
            {SORTS.map((option) => (
              <button
                key={option}
                type="button"
                className="chip"
                aria-pressed={sort === option}
                onClick={() => setSort(option)}
              >
                {option}
              </button>
            ))}
          </div>

          {board.length === 0 && (
            <p className="muted" style={{ marginTop: 'var(--space-3)' }}>
              No bonus chores on offer right now.
            </p>
          )}

          {claimError && (
            <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              {claimError}
            </p>
          )}

          <div className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
            {board.map((bonus) => (
              <article key={bonus.id} className="card">
                <div className="row" style={{ gap: 'var(--space-3)' }}>
                  <span className="tile-icon tile-icon--purple tile-icon--sm">
                    <Icon name={bonus.icon as IconName} size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, display: 'block' }}>{bonus.name}</span>
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {minutesUntil(bonus.expiresAt) === null
                        ? 'No deadline'
                        : countdown(minutesUntil(bonus.expiresAt) as number)}
                    </span>
                  </span>
                  <PointsPill value={bonus.points} small />
                </div>
                {(minutesUntil(bonus.expiresAt) ?? Infinity) < 120 && !bonus.claimed && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <Badge tone="soon" icon="clock">
                      Due soon
                    </Badge>
                  </div>
                )}

                <div className="row" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                  {bonus.claimed ? (
                    <>
                      <Button
                        tone="quiet"
                        block
                        disabled={busyId === bonus.id}
                        onClick={() => void release(bonus.id)}
                      >
                        Give back
                      </Button>
                      <Button tone="purple" block onClick={() => navigate(`/child/chore/${bonus.id}`)}>
                        Open
                      </Button>
                    </>
                  ) : (
                    <Button
                      tone="purple"
                      block
                      disabled={busyId === bonus.id || Boolean(holding)}
                      onClick={() => void claim(bonus.id)}
                    >
                      {busyId === bonus.id
                        ? 'Claiming…'
                        : holding
                          ? `Finish ${holding.name} first`
                          : 'Claim it'}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function StatusIcon({ done }: { done: boolean }) {
  return (
    <span
      style={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        border: `2px solid ${done ? 'var(--green)' : 'var(--outline-strong)'}`,
        background: done ? 'var(--green)' : 'transparent',
        color: done ? 'var(--text-on-green)' : 'transparent',
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <Icon name="check" size={15} />
    </span>
  );
}
