import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../../design/icons';
import { Button, Meter, PointsPill } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { children } from '../../mock/data';

const TEMPLATES: { name: string; icon: IconName; subtasks: string[] }[] = [
  { name: 'Kitchen', icon: 'kitchen', subtasks: ['Wash dishes', 'Clean countertops', 'Clean stove', 'Clear and clean kitchen table', 'Sweep floor', 'Mop floor'] },
  { name: 'Bathroom', icon: 'bathroom', subtasks: ['Wipe sink and counter', 'Clean mirror', 'Scrub toilet', 'Empty trash', 'Sweep floor'] },
  { name: 'Bedroom', icon: 'bedroom', subtasks: ['Make the bed', 'Clothes in hamper', 'Clear the floor', 'Dust surfaces'] },
  { name: 'Trash', icon: 'trash', subtasks: ['Empty every room bin', 'Take bags to the curb', 'Put in fresh liners'] },
  { name: 'Laundry', icon: 'laundry', subtasks: ['Sort and start a load', 'Move to dryer', 'Fold and put away'] },
  { name: 'Floors', icon: 'floors', subtasks: ['Pick up loose items', 'Sweep', 'Vacuum rugs', 'Mop'] },
  { name: 'Living room', icon: 'home', subtasks: ['Clear surfaces', 'Fold blankets', 'Vacuum'] },
  { name: 'Yard', icon: 'yard', subtasks: ['Pick up sticks', 'Rake leaves', 'Bag the piles'] },
];

const STEPS = ['Template', 'Details', 'Subtasks', 'Schedule', 'Review'];

/** Creating any chore is a short wizard, never one giant form. */
export function ChoreWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number] | null>(null);
  const [name, setName] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);

  const pick = (choice: (typeof TEMPLATES)[number] | null) => {
    setTemplate(choice);
    setName(choice?.name ?? '');
    setSubtasks(choice ? [...choice.subtasks] : ['']);
    setStep(1);
  };

  return (
    <>
      <ScreenTop title="New chore" back="/parent" />
      <main className="screen">
        <Meter value={step + 1} max={STEPS.length} label={STEPS[step]} right={`Step ${step + 1} of ${STEPS.length}`} />

        <div style={{ marginTop: 'var(--space-4)' }}>
          {step === 0 && (
            <div className="stack stack--tight">
              <p className="muted" style={{ marginTop: 0 }}>
                Start from a common chore or build your own. You can change everything afterwards.
              </p>
              {TEMPLATES.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  className="card card--interactive row"
                  onClick={() => pick(option)}
                >
                  <span className="tile-icon tile-icon--sm tile-icon--blue">
                    <Icon name={option.icon} size={20} />
                  </span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: 'block' }}>{option.name}</strong>
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {option.subtasks.length} subtasks
                    </span>
                  </span>
                  <Icon name="chevron" size={18} />
                </button>
              ))}
              <Button tone="quiet" block icon="plus" onClick={() => pick(null)}>
                Start from scratch
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="stack">
              <label className="field">
                <span className="field__label">Chore name</span>
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">Short description (optional)</span>
                <textarea className="textarea" placeholder="Anything the kids should know before starting." />
              </label>
              <div className="field">
                <span className="field__label">Icon</span>
                <div className="chip-row">
                  {TEMPLATES.map((option) => (
                    <button
                      key={option.name}
                      type="button"
                      className="chip"
                      aria-pressed={template?.icon === option.icon}
                      onClick={() => setTemplate({ ...option, name })}
                    >
                      <Icon name={option.icon} size={18} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="stack stack--tight">
              <p className="muted" style={{ marginTop: 0 }}>
                Every subtask must be checked before the camera unlocks.
              </p>
              {subtasks.map((task, index) => (
                <div key={index} className="row" style={{ gap: 'var(--space-2)' }}>
                  <input
                    className="input"
                    value={task}
                    placeholder={`Subtask ${index + 1}`}
                    onChange={(event) =>
                      setSubtasks((current) => current.map((entry, i) => (i === index ? event.target.value : entry)))
                    }
                  />
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label={`Remove subtask ${index + 1}`}
                    onClick={() => setSubtasks((current) => current.filter((_, i) => i !== index))}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              ))}
              <Button tone="quiet" block icon="plus" onClick={() => setSubtasks((current) => [...current, ''])}>
                Add subtask
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="stack">
              <div className="field">
                <span className="field__label">Who does it</span>
                <div className="chip-row">
                  {children.map((child) => (
                    <button key={child.id} type="button" className="chip" aria-pressed={child.id === 'child-1'}>
                      {child.name}
                    </button>
                  ))}
                  <button type="button" className="chip">
                    Alternate weekly
                  </button>
                </div>
              </div>
              <div className="field">
                <span className="field__label">Days</span>
                <div className="chip-row">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <button key={day} type="button" className="chip" aria-pressed>
                      {day}
                    </button>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                  Sunday has no required chore.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="card stack">
              <div className="row">
                <span className="iconbtn" style={{ color: 'var(--gold)' }}>
                  <Icon name={template?.icon ?? 'missions'} size={22} />
                </span>
                <strong style={{ flex: 1 }}>{name || 'Untitled chore'}</strong>
                <PointsPill value="Core points" small />
              </div>
              <ul className="muted" style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
                {subtasks.filter(Boolean).map((task, index) => (
                  <li key={index}>{task}</li>
                ))}
              </ul>
              <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                Core chores all use the household core point value from Settings.
              </p>
            </div>
          )}
        </div>

        <div className="row" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
          <Button tone="quiet" block onClick={() => (step === 0 ? navigate('/parent') : setStep(step - 1))}>
            Back
          </Button>
          <Button
            tone={step === STEPS.length - 1 ? 'go' : 'purple'}
            block
            onClick={() => (step === STEPS.length - 1 ? navigate('/parent') : setStep(step + 1))}
          >
            {step === STEPS.length - 1 ? 'Save chore' : 'Next'}
          </Button>
        </div>
      </main>
    </>
  );
}
