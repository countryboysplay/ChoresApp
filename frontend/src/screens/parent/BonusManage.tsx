import { useCallback, useEffect, useState } from 'react';
import type { BonusPosting } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, EmptyState, PointsPill, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { countdown } from '../../config/format';
import { api, ApiRequestError } from '../../lib/api';

const ICONS: IconName[] = ['floors', 'laundry', 'trash', 'yard', 'kitchen', 'bathroom', 'star'];

/** How long a posting stays on the board. Null is "until I take it down". */
const DURATIONS = [
  { label: '2 hours', minutes: 120 },
  { label: 'Rest of today', minutes: null as number | null },
  { label: '1 day', minutes: 24 * 60 },
] as const;

interface Draft {
  name: string;
  icon: IconName;
  points: string;
  category: string;
  subtasks: string;
  durationMinutes: number | null;
}

const BLANK: Draft = {
  name: '',
  icon: 'star',
  points: '',
  category: '',
  subtasks: '',
  durationMinutes: 120,
};

/**
 * The bonus board, as a parent runs it.
 *
 * First to claim gets it. A claimed chore that lapses goes back on the board by
 * itself, so this screen shows who is holding what and when it comes back rather
 * than needing a parent to tidy up.
 */
export function BonusManage() {
  const [board, setBoard] = useState<BonusPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoard((await api.bonus.board()).bonus);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load the board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async () => {
    if (!draft) return;
    const points = Number(draft.points);
    if (!draft.name.trim() || !Number.isInteger(points) || points <= 0) {
      setError('A bonus chore needs a name and a whole number of points above zero.');
      return;
    }

    setWorking(true);
    try {
      await api.bonus.post({
        name: draft.name.trim(),
        icon: draft.icon,
        points,
        category: draft.category.trim() || null,
        subtasks: draft.subtasks
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        expiresAt:
          draft.durationMinutes === null
            ? null
            : new Date(Date.now() + draft.durationMinutes * 60_000).toISOString(),
      });
      setDraft(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not post.');
    } finally {
      setWorking(false);
    }
  };

  const withdraw = async (id: string) => {
    setWorking(true);
    try {
      await api.bonus.withdraw(id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That could not be removed.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <>
        <ScreenTop title="Bonus chores" />
        <main className="screen screen--wide">
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            Loading&hellip;
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <ScreenTop title="Bonus chores" />
      <main className="screen screen--wide">
        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        <Button
          tone="purple"
          size="lg"
          block
          icon="plus"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={() => setDraft({ ...BLANK })}
        >
          Post a bonus chore
        </Button>

        {board.length === 0 ? (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <EmptyState
              icon="star"
              title="Nothing on the board"
              message="Post something extra and whoever claims it first gets the points."
            />
          </div>
        ) : (
          <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
            {board.map((entry) => {
              const minutesLeft = entry.expiresAt
                ? Math.max(0, Math.round((new Date(entry.expiresAt).getTime() - Date.now()) / 60_000))
                : null;
              const finished = ['submitted', 'approved'].includes(entry.status);

              return (
                <article key={entry.id} className="card stack stack--tight">
                  <div className="row" style={{ gap: 'var(--space-3)' }}>
                    <span className="tile-icon tile-icon--purple tile-icon--sm">
                      <Icon name={entry.icon as IconName} size={20} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 800, display: 'block' }}>{entry.name}</span>
                      <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                        {minutesLeft === null
                          ? 'No deadline'
                          : minutesLeft === 0
                            ? 'Deadline passed'
                            : countdown(minutesLeft)}
                        {entry.subtaskCount > 0 ? ` · ${entry.subtaskCount} steps` : ''}
                      </span>
                    </span>
                    <PointsPill value={entry.points} small />
                  </div>

                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    {finished ? (
                      <Badge tone="done" icon="check">
                        {entry.status === 'approved' ? 'Done' : 'Waiting for review'}
                      </Badge>
                    ) : entry.claimedBy ? (
                      <Badge tone="waiting" icon="lock">Claimed by {entry.claimedBy}</Badge>
                    ) : (
                      <Badge tone="bonus">Open to claim</Badge>
                    )}
                  </div>

                  {!finished && (
                    <Button
                      tone="quiet"
                      block
                      disabled={working || Boolean(entry.claimedBy)}
                      onClick={() => void withdraw(entry.id)}
                    >
                      {entry.claimedBy ? 'Someone is on it' : 'Take it down'}
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>

      {draft && (
        <Sheet title="Post a bonus chore" onClose={() => setDraft(null)}>
          <div className="stack">
            <p style={{ margin: 0 }} className="muted">
              You set the points. First to claim gets it, and it comes back to the board on its own
              if they do not finish in time.
            </p>

            <label className="stack stack--tight">
              <span className="eyebrow">What needs doing</span>
              <input
                className="input"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Example: wash the car"
              />
            </label>

            <label className="stack stack--tight">
              <span className="eyebrow">Points</span>
              <input
                className="input numeric"
                type="number"
                min={1}
                value={draft.points}
                onChange={(event) => setDraft({ ...draft, points: event.target.value })}
                placeholder="25"
              />
            </label>

            <label className="stack stack--tight">
              <span className="eyebrow">Steps, one per line (optional)</span>
              <textarea
                className="textarea"
                rows={3}
                value={draft.subtasks}
                onChange={(event) => setDraft({ ...draft, subtasks: event.target.value })}
                placeholder={'Rinse it first\nDry with the cloth in the garage'}
              />
            </label>

            <div className="stack stack--tight">
              <span className="eyebrow">Stays on the board for</span>
              <div className="chip-row" role="group" aria-label="How long it stays up">
                {DURATIONS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className="chip"
                    aria-pressed={draft.durationMinutes === option.minutes}
                    onClick={() => setDraft({ ...draft, durationMinutes: option.minutes })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="stack stack--tight">
              <span className="eyebrow">Icon</span>
              <div className="chip-row" role="group" aria-label="Icon">
                {ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className="chip"
                    aria-pressed={draft.icon === icon}
                    aria-label={icon}
                    onClick={() => setDraft({ ...draft, icon })}
                  >
                    <Icon name={icon} size={18} />
                  </button>
                ))}
              </div>
            </div>

            <Button tone="go" size="lg" block disabled={working} onClick={() => void post()}>
              {working ? 'Posting…' : 'Post it'}
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
