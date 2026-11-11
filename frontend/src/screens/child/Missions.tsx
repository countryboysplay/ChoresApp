import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChoreStatus, ChoreWeekResponse } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, Segmented, EmptyState } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { countdown } from '../../config/format';
import { api, ApiRequestError } from '../../lib/api';
import { useChildDay } from '../../lib/childDay';
import { isFinished, Loot, StatusBadge, statusAccent } from './choreStatus';

const RANGE = ['Today', 'This week'] as const;
const SORTS = ['Highest points', 'Newest', 'Expiring soon'] as const;
const QUEST_TABS = ['To do', 'In progress', 'Done'] as const;
export type QuestTab = (typeof QUEST_TABS)[number];

/** Sent in counts as in progress (waiting on a parent); sent back is to do again. */
export function questTab(status: ChoreStatus): QuestTab {
  if (isFinished(status)) return 'Done';
  if (status === 'in_progress' || status === 'submitted') return 'In progress';
  return 'To do';
}

/** "Monday", from a household date, without pulling in a date library. */
function weekdayLabel(date: string): string {
  // Midday so the label cannot slip a day on either side of a timezone.
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

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
  // null until the kid picks a tab: then it opens wherever their chores are.
  const [pickedFilter, setQuestFilter] = useState<QuestTab | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [week, setWeek] = useState<ChoreWeekResponse | null>(null);
  const [weekError, setWeekError] = useState<string | null>(null);

  /*
   * Fetched when the week is asked for rather than on every visit to Missions.
   * Most openings of this screen are a child checking what is left today, and
   * a week nobody looked at is a query nobody needed.
   */
  const loadWeek = useCallback(async () => {
    try {
      setWeek(await api.chores.week());
      setWeekError(null);
    } catch (caught) {
      setWeekError(
        caught instanceof ApiRequestError ? caught.message : 'Could not load the week.',
      );
    }
  }, []);

  useEffect(() => {
    if (range === 'This week' && !week) void loadWeek();
  }, [range, week, loadWeek]);

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
  const questFilter =
    pickedFilter ?? QUEST_TABS.find((tab) => required.some((chore) => questTab(chore.status) === tab)) ?? 'To do';
  const shownRequired = required.filter((chore) => questTab(chore.status) === questFilter);

  // The board is what is on offer plus anything this child already claimed, so
  // a claimed chore does not vanish from the screen it was claimed on.
  const board = useMemo(() => {
    const list = [...(day?.availableBonus ?? []), ...(day?.bonus ?? [])];
    if (sort === 'Highest points') list.sort((a, b) => b.points - a.points);
    if (sort === 'Newest')
      list.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
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
        <ScreenTop title="Quests" />
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
        <ScreenTop title="Quests" />
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
      <ScreenTop title="Quests" />
      <main className="screen">
        <Segmented options={RANGE} value={range} onChange={setRange} label="Time range" />

        <section style={{ marginTop: 'var(--space-5)' }}>
          <span className="eyebrow">Required chores</span>

          {range === 'This week' && weekError && (
            <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
              {weekError}
            </p>
          )}

          {range === 'This week' && !week && !weekError && (
            <p className="muted" style={{ marginTop: 'var(--space-3)' }}>Loading the week…</p>
          )}

          {range === 'This week' && week && (
            <div className="stack" style={{ marginTop: 'var(--space-3)' }}>
              {week.days.map((day) => (
                <section key={day.date} className="card stack stack--tight">
                  <div className="row row--between">
                    <strong>{weekdayLabel(day.date)}</strong>
                    {day.date === week.today && <Badge tone="info">Today</Badge>}
                  </div>
                  {day.chores.length === 0 ? (
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {day.date > week.today ? 'Not started yet' : 'Nothing due'}
                    </span>
                  ) : (
                    day.chores.map((chore) => (
                      <div key={chore.id} className="row" style={{ gap: 'var(--space-3)' }}>
                        <span className="tile-icon tile-icon--gold tile-icon--sm">
                          <Icon name={chore.icon as IconName} size={18} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 700, display: 'block' }}>{chore.name}</span>
                        </span>
                        <Loot points={chore.points} />
                        <StatusBadge status={chore.status} />
                      </div>
                    ))
                  )}
                </section>
              ))}
            </div>
          )}

          {range === 'Today' && required.length === 0 && (
            <EmptyState art="no-chores" title="Nothing due today" message="No required quests. Bonus chores still pay." />
          )}

          {range === 'Today' &&
            required.length > 0 &&
            required.every((chore) => isFinished(chore.status)) && (
              <EmptyState art="all-done-today" title="All done today" message="Every quest approved. Nice run." />
            )}

          {range === 'Today' && required.length > 0 && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Segmented options={QUEST_TABS} value={questFilter} onChange={setQuestFilter} label="Quest status" />
              {shownRequired.length === 0 && (
                <p className="muted" style={{ marginTop: 'var(--space-3)', textAlign: 'center' }}>
                  {questFilter === 'Done' ? 'Nothing approved yet today.' : `Nothing ${questFilter.toLowerCase()} right now.`}
                </p>
              )}
            </div>
          )}

          <div
            className="stack stack--tight"
            style={{ marginTop: 'var(--space-3)', display: range === 'Today' ? undefined : 'none' }}
          >
            {shownRequired.map((chore) => {
              const done = chore.subtasks.filter((task) => task.done).length;
              return (
                <button
                  key={chore.id}
                  type="button"
                  className={`neon-chore ${statusAccent[chore.status]}`}
                  onClick={() => navigate(`/child/chore/${chore.id}`)}
                >
                  <StatusIcon done={done === chore.subtasks.length} />
                  <span className="tile-icon tile-icon--blue tile-icon--sm">
                    <Icon name={chore.icon as IconName} size={20} />
                  </span>
                  <span className="neon-chore__main">
                    <strong>{chore.name}</strong>
                    <span className="neon-chore__meta">
                      <span>
                        <Icon name="calendar-check" size={14} /> Due today
                      </span>
                      <span className="numeric">
                        {done} of {chore.subtasks.length} steps
                      </span>
                    </span>
                    <StatusBadge status={chore.status} />
                  </span>
                  <Loot points={chore.points} />
                </button>
              );
            })}
          </div>
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
            <p className="muted row" style={{ marginTop: 'var(--space-3)', gap: 'var(--space-2)' }}>
              <Icon name="bonus" size={18} /> No bonus chores on offer right now.
            </p>
          )}

          {claimError && (
            <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              {claimError}
            </p>
          )}

          <div className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
            {board.map((bonus) => (
              <article key={bonus.id} className="neon-chore" style={{ display: 'block' }}>
                <div className="row" style={{ gap: 'var(--space-3)' }}>
                  <span className="tile-icon tile-icon--purple tile-icon--sm">
                    <Icon name={bonus.icon as IconName} size={20} />
                  </span>
                  <span className="neon-chore__main">
                    <strong>{bonus.name}</strong>
                    <span className="neon-chore__meta">
                      <span>
                        <Icon name="timer" size={14} />
                        {minutesUntil(bonus.expiresAt) === null
                          ? 'No deadline'
                          : countdown(minutesUntil(bonus.expiresAt) as number)}
                      </span>
                      {bonus.claimed && (
                        <span>
                          <Icon name="key" size={14} /> Yours
                        </span>
                      )}
                    </span>
                  </span>
                  <Loot points={bonus.points} />
                </div>
                {(minutesUntil(bonus.expiresAt) ?? Infinity) < 120 && !bonus.claimed && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <Badge tone="soon" icon="hourglass">
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
