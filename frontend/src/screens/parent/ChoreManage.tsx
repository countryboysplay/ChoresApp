import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ChoreDefinition, HouseholdMember } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { Button, EmptyState, PointsPill, Segmented, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';

const RECURRENCE = ['Daily', 'Weekly'] as const;
const WEEKDAYS = [
  { iso: 1, label: 'Mon' },
  { iso: 2, label: 'Tue' },
  { iso: 3, label: 'Wed' },
  { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' },
  { iso: 6, label: 'Sat' },
  { iso: 7, label: 'Sun' },
] as const;

interface Draft {
  id: string;
  name: string;
  points: string;
  assignedTo: string[];
  recurrence: (typeof RECURRENCE)[number];
  days: number[];
  isActive: boolean;
}

/** "Kayden and Ava - Mon, Thu", or what stands in when a chore has nobody. */
function summarise(chore: ChoreDefinition): string {
  const first = chore.schedules[0];
  if (!first) return 'Not assigned to anybody';
  const names = [...new Set(chore.schedules.map((schedule) => schedule.assignedToName))];
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  if (first.recurrence === 'daily') return `${who} · Every day`;
  const days = WEEKDAYS.filter((day) => first.daysOfWeek.includes(day.iso)).map((day) => day.label);
  return `${who} · ${days.join(', ')}`;
}

/**
 * The chores a household has, as a parent changes them afterwards.
 *
 * The wizard could only ever create. This is the second half of it: fixing a
 * name or a point value, moving a chore to a different child or a different set
 * of days, and standing one down when it is no longer wanted.
 *
 * Retiring rather than deleting, for the same reason rewards retire. A chore
 * already done points at this row, and a child's history should not lose the
 * name of what they did. Retiring stops the schedule, so nothing new appears.
 */
export function ChoreManage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [chores, setChores] = useState<ChoreDefinition[]>([]);
  const [children, setChildren] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const [definitions, household] = await Promise.all([
        api.household.chores(),
        api.household.members(),
      ]);
      setChores(definitions.chores);
      setChildren(
        household.members.filter((member) => member.role === 'child' && member.isActive),
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load the chores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const edit = (chore: ChoreDefinition) => {
    // The wizard gives everybody it picks the same pattern, so the first
    // schedule speaks for the rest. A mixed set could only come from SQL.
    const first = chore.schedules[0];
    setDraft({
      id: chore.id,
      name: chore.name,
      points: String(chore.points),
      assignedTo: [...new Set(chore.schedules.map((schedule) => schedule.assignedTo))],
      recurrence: first?.recurrence === 'weekly' ? 'Weekly' : 'Daily',
      days: first?.daysOfWeek ?? [],
      isActive: chore.isActive,
    });
    setError(null);
  };

  // The schedule links here with ?edit=<id> so a parent who taps a chore on the
  // week lands on that chore, not on the list. The parameter is spent once:
  // dropping it stops the sheet reopening every time the list reloads.
  useEffect(() => {
    const wanted = params.get('edit');
    if (!wanted || chores.length === 0) return;
    const chore = chores.find((candidate) => candidate.id === wanted);
    setParams({}, { replace: true });
    if (chore) edit(chore);
  }, [chores, params, setParams]);

  const save = async () => {
    if (!draft) return;
    const value = Number(draft.points);
    if (!draft.name.trim() || !Number.isInteger(value) || value <= 0) {
      setError('A chore needs a name and a whole number of points above zero.');
      return;
    }
    if (draft.assignedTo.length === 0) {
      setError('Choose who does this chore.');
      return;
    }
    if (draft.recurrence === 'Weekly' && draft.days.length === 0) {
      setError('Pick at least one day.');
      return;
    }

    setWorking(true);
    setError(null);
    try {
      await api.household.updateChore(draft.id, {
        name: draft.name.trim(),
        points: value,
        // Saving a retired chore is how it comes back, so the Retire button is
        // never a one-way door.
        ...(draft.isActive ? {} : { isActive: true }),
        // Sent whole: the server stands the old rows down and writes these in
        // their place. Chores already on a child's list keep the points and the
        // wording they were created with, so today is not rewritten under them.
        schedules: draft.assignedTo.map((childId) => ({
          assignedTo: childId,
          recurrence: draft.recurrence === 'Daily' ? 'daily' : 'weekly',
          daysOfWeek: draft.recurrence === 'Weekly' ? draft.days : [],
        })),
      });
      setDraft(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not save.');
    } finally {
      setWorking(false);
    }
  };

  const retire = async () => {
    if (!draft) return;
    setWorking(true);
    setError(null);
    try {
      await api.household.retireChore(draft.id);
      setDraft(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not work.');
    } finally {
      setWorking(false);
    }
  };

  const toggleChild = (childId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      assignedTo: draft.assignedTo.includes(childId)
        ? draft.assignedTo.filter((id) => id !== childId)
        : [...draft.assignedTo, childId],
    });
  };

  return (
    <>
      <ScreenTop title="Chores" />
      <main className="screen screen--wide">
        {error && !draft && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        {loading ? (
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            Loading&hellip;
          </p>
        ) : (
          <>
            <Button
              tone="purple"
              size="lg"
              block
              icon="plus"
              style={{ marginTop: 'var(--space-4)' }}
              onClick={() => navigate('/parent/chores/new')}
            >
              Add a chore
            </Button>

            {chores.length === 0 ? (
              <div style={{ marginTop: 'var(--space-5)' }}>
                <EmptyState
                  icon="missions"
                  title="No chores yet"
                  message="Add the first one and it appears on the schedule and on the kids' day."
                />
              </div>
            ) : (
              <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
                {chores.map((chore) => (
                  <article
                    key={chore.id}
                    className="card row"
                    style={{ gap: 'var(--space-3)', opacity: chore.isActive ? 1 : 0.55 }}
                  >
                    <span className="tile-icon tile-icon--gold tile-icon--sm">
                      <Icon name={chore.icon as IconName} size={20} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 800, display: 'block' }}>{chore.name}</span>
                      <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                        {chore.isActive ? summarise(chore) : 'Retired, and no longer scheduled'}
                      </span>
                    </span>
                    <PointsPill value={chore.points} small />
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={`Edit ${chore.name}`}
                      onClick={() => edit(chore)}
                    >
                      <Icon name="chevron" size={18} />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {draft && (
        <Sheet title="Edit chore" onClose={() => setDraft(null)}>
          <div className="stack">
            {error && (
              <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
                {error}
              </p>
            )}

            <label className="stack stack--tight">
              <span className="eyebrow">Name</span>
              <input
                className="input"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>

            <label className="stack stack--tight">
              <span className="eyebrow">Points</span>
              <input
                className="input"
                inputMode="numeric"
                value={draft.points}
                onChange={(event) => setDraft({ ...draft, points: event.target.value })}
              />
            </label>

            <span className="eyebrow">Who does it</span>
            {children.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No children yet. Add one on the Household screen first.
              </p>
            ) : (
              <div className="stack stack--tight">
                {children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    className="card card--interactive row"
                    aria-pressed={draft.assignedTo.includes(child.id)}
                    onClick={() => toggleChild(child.id)}
                  >
                    <Icon
                      name={draft.assignedTo.includes(child.id) ? 'check' : 'user'}
                      size={20}
                      style={{
                        color: draft.assignedTo.includes(child.id) ? 'var(--green)' : undefined,
                      }}
                    />
                    <span style={{ flex: 1, fontWeight: 700 }}>{child.displayName}</span>
                  </button>
                ))}
              </div>
            )}

            <span className="eyebrow">How often</span>
            <Segmented
              options={RECURRENCE}
              value={draft.recurrence}
              onChange={(recurrence) => setDraft({ ...draft, recurrence })}
              label="How often"
            />

            {draft.recurrence === 'Weekly' && (
              <div className="chip-row" role="group" aria-label="Days of the week">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.iso}
                    type="button"
                    className="chip"
                    aria-pressed={draft.days.includes(day.iso)}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        days: draft.days.includes(day.iso)
                          ? draft.days.filter((iso) => iso !== day.iso)
                          : [...draft.days, day.iso],
                      })
                    }
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            )}

            <div className="row" style={{ gap: 'var(--space-3)' }}>
              {draft.isActive && (
                <Button tone="stop" block disabled={working} onClick={() => void retire()}>
                  Retire
                </Button>
              )}
              <Button tone="go" block disabled={working} onClick={() => void save()}>
                {working ? 'Saving…' : 'Save'}
              </Button>
            </div>

            {draft.isActive ? (
              <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                A change applies to chores made from now on. Anything already on a child&rsquo;s list
                today keeps the points and the wording it was given. Retiring stops the schedule so
                nothing new appears; what has been done keeps its place in their history, which is
                why it is not deleted outright.
              </p>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                This chore is retired. Saving it with somebody assigned puts it back on the schedule.
              </p>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
