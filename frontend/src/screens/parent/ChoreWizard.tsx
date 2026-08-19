import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { HouseholdMember } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { Button, Meter, Segmented } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';

const STEPS = ['Chore', 'Steps', 'Who and when'] as const;
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

/** Starting points, so a parent does not face an empty checklist. */
const TEMPLATES: { name: string; icon: IconName; subtasks: string[] }[] = [
  { name: 'Kitchen', icon: 'kitchen', subtasks: ['Wash dishes', 'Clean countertops', 'Clean stove', 'Sweep floor', 'Mop floor'] },
  { name: 'Bathroom', icon: 'bathroom', subtasks: ['Wipe sink and counter', 'Clean mirror', 'Scrub toilet', 'Empty trash', 'Sweep floor'] },
  { name: 'Bedroom', icon: 'bedroom', subtasks: ['Make the bed', 'Clothes in hamper', 'Clear the floor', 'Dust surfaces'] },
  { name: 'Trash', icon: 'trash', subtasks: ['Empty every room bin', 'Take bags to the curb', 'Put in fresh liners'] },
  { name: 'Laundry', icon: 'laundry', subtasks: ['Sort and start a load', 'Move to dryer', 'Fold and put away'] },
  { name: 'Floors', icon: 'floors', subtasks: ['Pick up loose items', 'Sweep', 'Vacuum rugs', 'Mop'] },
  { name: 'Living room', icon: 'home', subtasks: ['Clear surfaces', 'Fold blankets', 'Vacuum'] },
  { name: 'Yard', icon: 'yard', subtasks: ['Pick up sticks', 'Rake leaves', 'Bag the piles'] },
];

export function ChoreWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [children, setChildren] = useState<HouseholdMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>('kitchen');
  const [points, setPoints] = useState('10');
  const [subtasks, setSubtasks] = useState<string[]>(['']);
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<(typeof RECURRENCE)[number]>('Daily');
  const [days, setDays] = useState<number[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const { members } = await api.household.members();
        const kids = members.filter((member) => member.role === 'child' && member.isActive);
        setChildren(kids);
      } catch {
        setError('Could not load the household.');
      }
    })();
  }, []);

  const applyTemplate = (template: (typeof TEMPLATES)[number]) => {
    setName(template.name);
    setIcon(template.icon);
    setSubtasks([...template.subtasks]);
    setStep(1);
  };

  const save = async () => {
    const value = Number(points);
    if (!name.trim() || !Number.isInteger(value) || value <= 0) {
      setError('A chore needs a name and a whole number of points above zero.');
      return;
    }
    if (assignedTo.length === 0) {
      setError('Choose who does this chore.');
      return;
    }
    if (recurrence === 'Weekly' && days.length === 0) {
      setError('Pick at least one day.');
      return;
    }

    setWorking(true);
    setError(null);
    try {
      await api.household.createChore({
        name: name.trim(),
        icon,
        points: value,
        subtasks: subtasks
          .map((title) => title.trim())
          .filter(Boolean)
          .map((title) => ({ title })),
        schedules: assignedTo.map((childId) => ({
          assignedTo: childId,
          recurrence: recurrence === 'Daily' ? 'daily' : 'weekly',
          daysOfWeek: recurrence === 'Weekly' ? days : [],
        })),
      });
      navigate('/parent/schedule', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not save.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <ScreenTop title="New chore" back={-1} />
      <main className="screen">
        <Meter
          value={step + 1}
          max={STEPS.length}
          label={STEPS[step] as string}
          right={`Step ${step + 1} of ${STEPS.length}`}
        />

        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            {error}
          </p>
        )}

        {step === 0 && (
          <section className="stack" style={{ marginTop: 'var(--space-4)' }}>
            <span className="eyebrow">Start from a common one</span>
            <div className="grid-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  className="card card--interactive row"
                  onClick={() => applyTemplate(template)}
                >
                  <span className="tile-icon tile-icon--gold tile-icon--sm">
                    <Icon name={template.icon} size={20} />
                  </span>
                  <span style={{ fontWeight: 700 }}>{template.name}</span>
                </button>
              ))}
            </div>

            <hr className="divider" />

            <label className="stack stack--tight">
              <span className="eyebrow">Or name your own</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Example: feed the dog"
              />
            </label>

            <label className="stack stack--tight">
              <span className="eyebrow">Points</span>
              <input
                className="input numeric"
                type="number"
                min={1}
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
            </label>

            <Button
              tone="purple"
              size="lg"
              block
              disabled={name.trim().length === 0}
              onClick={() => setStep(1)}
            >
              Next
            </Button>
          </section>
        )}

        {step === 1 && (
          <section className="stack" style={{ marginTop: 'var(--space-4)' }}>
            <span className="eyebrow">Steps, in the order they should be done</span>
            {subtasks.map((subtask, index) => (
              <div key={index} className="row" style={{ gap: 'var(--space-2)' }}>
                <input
                  className="input"
                  value={subtask}
                  onChange={(event) =>
                    setSubtasks(subtasks.map((entry, i) => (i === index ? event.target.value : entry)))
                  }
                  placeholder={`Step ${index + 1}`}
                  aria-label={`Step ${index + 1}`}
                />
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() => setSubtasks(subtasks.filter((_, i) => i !== index))}
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            ))}
            <Button tone="quiet" block icon="plus" onClick={() => setSubtasks([...subtasks, ''])}>
              Add a step
            </Button>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              A chore with no steps still works. The camera unlocks once every step is ticked.
            </p>
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <Button tone="quiet" block onClick={() => setStep(0)}>
                Back
              </Button>
              <Button tone="purple" block onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="stack" style={{ marginTop: 'var(--space-4)' }}>
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
                    aria-pressed={assignedTo.includes(child.id)}
                    onClick={() =>
                      setAssignedTo(
                        assignedTo.includes(child.id)
                          ? assignedTo.filter((id) => id !== child.id)
                          : [...assignedTo, child.id],
                      )
                    }
                  >
                    <Icon
                      name={assignedTo.includes(child.id) ? 'check' : 'user'}
                      size={20}
                      style={{ color: assignedTo.includes(child.id) ? 'var(--green)' : undefined }}
                    />
                    <span style={{ flex: 1, fontWeight: 700 }}>{child.displayName}</span>
                  </button>
                ))}
              </div>
            )}

            <span className="eyebrow">How often</span>
            <Segmented options={RECURRENCE} value={recurrence} onChange={setRecurrence} label="How often" />

            {recurrence === 'Weekly' && (
              <div className="chip-row" role="group" aria-label="Days of the week">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.iso}
                    type="button"
                    className="chip"
                    aria-pressed={days.includes(day.iso)}
                    onClick={() =>
                      setDays(days.includes(day.iso) ? days.filter((d) => d !== day.iso) : [...days, day.iso])
                    }
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            )}

            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              It starts today. Nothing is added to days that have already passed.
            </p>

            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <Button tone="quiet" block onClick={() => setStep(1)}>
                Back
              </Button>
              <Button tone="go" block disabled={working} onClick={() => void save()}>
                {working ? 'Saving…' : 'Create chore'}
              </Button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
