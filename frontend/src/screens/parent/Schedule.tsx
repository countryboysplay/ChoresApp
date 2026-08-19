import { useState } from 'react';
import { Icon } from '../../design/icons';
import { Badge, Button, Segmented, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { children, coreChores } from '../../mock/data';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Demo assignment grid. Sunday has no required chore; Saturday is a lighter day. */
const week: Record<string, { child: string; chore: string; icon: 'kitchen' | 'bathroom' | 'floors' | 'trash' }[]> = {
  Sunday: [],
  Monday: [
    { child: 'Child 1', chore: 'Kitchen Cleaning', icon: 'kitchen' },
    { child: 'Child 2', chore: 'Bathroom', icon: 'bathroom' },
  ],
  Tuesday: [
    { child: 'Child 1', chore: 'Bathroom', icon: 'bathroom' },
    { child: 'Child 2', chore: 'Kitchen Cleaning', icon: 'kitchen' },
  ],
  Wednesday: [
    { child: 'Child 1', chore: 'Kitchen Cleaning', icon: 'kitchen' },
    { child: 'Child 2', chore: 'Floors', icon: 'floors' },
  ],
  Thursday: [
    { child: 'Child 1', chore: 'Floors', icon: 'floors' },
    { child: 'Child 2', chore: 'Kitchen Cleaning', icon: 'kitchen' },
  ],
  Friday: [
    { child: 'Child 1', chore: 'Kitchen Cleaning', icon: 'kitchen' },
    { child: 'Child 2', chore: 'Trash', icon: 'trash' },
  ],
  Saturday: [
    { child: 'Child 1', chore: 'Trash', icon: 'trash' },
    { child: 'Child 2', chore: 'Bathroom', icon: 'bathroom' },
  ],
};

const VIEW = ['Daily', 'Weekly'] as const;

export function Schedule() {
  const [view, setView] = useState<(typeof VIEW)[number]>('Weekly');
  const [override, setOverride] = useState<string | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);

  return (
    <>
      <ScreenTop
        title="Weekly schedule"
        trailing={
          <Button size="sm" tone="quiet" onClick={() => setPauseOpen(true)}>
            Pause
          </Button>
        }
      />
      <main className="screen screen--wide">
        <Segmented options={VIEW} value={view} onChange={setView} label="Schedule view" />

        <div className="stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
          {(view === 'Daily' ? DAYS.slice(1, 2) : DAYS).map((day) => (
            <section key={day} className="card stack stack--tight">
              <div className="row row--between">
                <strong>{day}</strong>
                {week[day]?.length ? (
                  <Button size="sm" tone="quiet" onClick={() => setOverride(day)}>
                    Change
                  </Button>
                ) : (
                  <Badge tone="neutral">No required chore</Badge>
                )}
              </div>
              {week[day]?.map((entry) => (
                <div key={`${day}-${entry.child}`} className="row" style={{ gap: 'var(--space-3)' }}>
                  <span className="tile-icon tile-icon--sm tile-icon--blue">
                    <Icon name={entry.icon} size={18} />
                  </span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>{entry.child}</strong>
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {entry.chore}
                    </span>
                  </span>
                </div>
              ))}
              {week[day]?.length ? (
                <div
                  className="row"
                  style={{ gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}
                >
                  <Badge tone="info" icon="bell">
                    8:45 PM reminder
                  </Badge>
                  <Badge tone="waiting" icon="alert">
                    11:00 PM escalation
                  </Badge>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </main>

      {override && (
        <Sheet
          title={`Change ${override}`}
          onClose={() => setOverride(null)}
          footer={
            <Button tone="primary" block onClick={() => setOverride(null)}>
              Save change
            </Button>
          }
        >
          <div className="stack">
            <div className="field">
              <span className="field__label">Apply to</span>
              <div className="chip-row">
                <button type="button" className="chip" aria-pressed>
                  This day only
                </button>
                <button type="button" className="chip">
                  All future {override}s
                </button>
              </div>
            </div>
            {children.map((child) => (
              <label key={child.id} className="field">
                <span className="field__label">{child.name}</span>
                <select className="select" defaultValue={coreChores[0]?.name}>
                  {['Kitchen Cleaning', 'Bathroom', 'Floors', 'Trash', 'Laundry', 'No chore'].map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            ))}
            <label className="row" style={{ gap: 'var(--space-3)' }}>
              <input type="checkbox" style={{ width: 22, height: 22 }} />
              <span>Swap the two kids&apos; chores for this day</span>
            </label>
          </div>
        </Sheet>
      )}

      {pauseOpen && (
        <Sheet
          title="Pause chores"
          onClose={() => setPauseOpen(false)}
          footer={
            <Button tone="primary" block onClick={() => setPauseOpen(false)}>
              Start pause
            </Button>
          }
        >
          <div className="stack">
            <p className="muted" style={{ marginTop: 0 }}>
              Paused days do not count as missed and do not break a streak.
            </p>
            <label className="field">
              <span className="field__label">Who</span>
              <select className="select">
                <option>Everyone</option>
                {children.map((child) => (
                  <option key={child.id}>{child.name}</option>
                ))}
              </select>
            </label>
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="field__label">From</span>
                <input className="input" type="date" />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span className="field__label">To</span>
                <input className="input" type="date" />
              </label>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
