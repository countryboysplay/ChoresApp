import { useState } from 'react';
import { Icon } from '../../design/icons';
import { Button, PointsPill, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { rewards } from '../../mock/data';

export function RewardManage() {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <ScreenTop
        title="Rewards"
        back="/parent"
        trailing={
          <Button size="sm" tone="primary" icon="plus" onClick={() => setCreating(true)}>
            New
          </Button>
        }
      />
      <main className="screen screen--wide">
        <section className="card card--status is-waiting" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <Icon name="bell" size={20} />
            <strong>1 suggestion from the kids</strong>
          </div>
          <p style={{ margin: '0 0 var(--space-3)' }}>
            Child 2 suggested &ldquo;pick the weekend breakfast&rdquo;. Set the cost and rules before it
            goes in the store.
          </p>
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <Button size="sm" tone="quiet">
              Dismiss
            </Button>
            <Button size="sm" tone="primary">
              Set up reward
            </Button>
          </div>
        </section>

        <div className="stack stack--tight">
          {rewards.map((reward) => (
            <article key={reward.id} className="card row">
              <span className="tile-icon tile-icon--purple tile-icon--sm">
                <Icon name={reward.icon} size={20} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{reward.name}</strong>
                <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                  {reward.category}
                  {reward.lockedUntil ? ` · ${reward.lockedUntil}` : ''}
                </span>
              </span>
              <PointsPill value={reward.cost} small />
              <Button size="sm" tone="quiet">
                Edit
              </Button>
            </article>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          Rewards are shared by both kids. There is no separate catalog per child.
        </p>
        <Button
          tone="purple"
          size="lg"
          block
          icon="plus"
          style={{ marginTop: 'var(--space-4)' }}
          onClick={() => setCreating(true)}
        >
          Add reward
        </Button>
      </main>

      {creating && (
        <Sheet
          title="New reward"
          onClose={() => setCreating(false)}
          footer={
            <Button tone="primary" block onClick={() => setCreating(false)}>
              Add to store
            </Button>
          }
        >
          <div className="stack">
            <label className="field">
              <span className="field__label">Name</span>
              <input className="input" placeholder="Example: choose the weekend activity" />
            </label>
            <label className="field">
              <span className="field__label">Description</span>
              <input className="input" placeholder="Short and clear" />
            </label>
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="field__label">Point cost</span>
                <input className="input numeric" type="number" min={1} />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span className="field__label">Category</span>
                <select className="select">
                  <option>Screen Time</option>
                  <option>Food</option>
                  <option>Activities</option>
                  <option>Privileges</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span className="field__label">How often can it be redeemed?</span>
              <select className="select">
                <option>No limit</option>
                <option>Once per day</option>
                <option>Once per week</option>
                <option>Once per month</option>
              </select>
            </label>
          </div>
        </Sheet>
      )}
    </>
  );
}
