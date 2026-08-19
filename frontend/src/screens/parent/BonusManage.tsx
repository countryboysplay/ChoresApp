import { useState } from 'react';
import { Icon } from '../../design/icons';
import { Badge, Button, PointsPill, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { countdown } from '../../config/format';
import { bonusChores } from '../../mock/data';

const CATEGORIES = ['All', 'Kitchen', 'Yard', 'Bedrooms', 'Laundry'] as const;

export function BonusManage() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [creating, setCreating] = useState(false);

  const visible =
    category === 'All' ? bonusChores : bonusChores.filter((chore) => chore.category === category);

  return (
    <>
      <ScreenTop
        title="Bonus chores"
        back="/parent"
        trailing={
          <Button size="sm" tone="primary" icon="plus" onClick={() => setCreating(true)}>
            New
          </Button>
        }
      />
      <main className="screen screen--wide">
        <div className="chip-row">
          {CATEGORIES.map((option) => (
            <button
              key={option}
              type="button"
              className="chip"
              aria-pressed={category === option}
              onClick={() => setCategory(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
          {visible.map((chore) => (
            <article key={chore.id} className="card stack stack--tight">
              <div className="row" style={{ gap: 'var(--space-3)' }}>
                <span className="tile-icon tile-icon--purple tile-icon--sm">
                  <Icon name={chore.icon} size={20} />
                </span>
                <span style={{ flex: 1 }}>
                  <strong style={{ display: 'block' }}>{chore.name}</strong>
                  <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                    {chore.category} · {chore.subtasks.length} subtasks ·{' '}
                    {chore.expiresInMinutes ? countdown(chore.expiresInMinutes) : 'No deadline'}
                  </span>
                </span>
                <PointsPill value={chore.points} small />
              </div>
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                {chore.claimedBy ? (
                  <Badge tone="waiting" icon="lock">
                    Claimed by {chore.claimedBy}
                  </Badge>
                ) : (
                  <Badge tone="done" icon="check">
                    Open to claim
                  </Badge>
                )}
                <Button size="sm" tone="quiet">
                  Edit
                </Button>
              </div>
            </article>
          ))}
        </div>
        <Button
          tone="purple"
          size="lg"
          block
          icon="plus"
          style={{ marginTop: 'var(--space-4)' }}
          onClick={() => setCreating(true)}
        >
          Add bonus chore
        </Button>
      </main>

      {creating && (
        <Sheet
          title="New bonus chore"
          onClose={() => setCreating(false)}
          footer={
            <Button tone="primary" block onClick={() => setCreating(false)}>
              Publish
            </Button>
          }
        >
          <div className="stack">
            <label className="field">
              <span className="field__label">Name</span>
              <input className="input" placeholder="Example: wash the car" />
            </label>
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="field__label">Points</span>
                <input className="input numeric" type="number" min={1} placeholder="25" />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span className="field__label">Category</span>
                <select className="select">
                  {CATEGORIES.filter((option) => option !== 'All').map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field">
              <span className="field__label">Repeat</span>
              <div className="chip-row">
                <button type="button" className="chip" aria-pressed>
                  One-off
                </button>
                <button type="button" className="chip">
                  Weekly
                </button>
              </div>
            </div>
            <label className="field">
              <span className="field__label">Expires after</span>
              <select className="select">
                <option>4 hours</option>
                <option>Today</option>
                <option>2 days</option>
                <option>No deadline</option>
              </select>
            </label>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              You set the point value. First to claim gets it.
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}
