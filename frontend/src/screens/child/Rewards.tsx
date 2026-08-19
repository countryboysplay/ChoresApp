import { useMemo, useState } from 'react';
import { Icon } from '../../design/icons';
import { Badge, Button, Meter, PointsPill, Segmented, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { points } from '../../config/format';
import { children, rewards, type RewardItem } from '../../mock/data';
import { playSound } from '../../design/sound';

const me = children[0]!;
const TABS = ['All', 'Available', 'Goals'] as const;
const CATEGORIES = ['Screen Time', 'Food', 'Activities', 'Privileges'] as const;

export function Rewards() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('All');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | null>(null);
  const [redeeming, setRedeeming] = useState<RewardItem | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const visible = useMemo(() => {
    let list = rewards;
    if (tab === 'Available') list = list.filter((reward) => reward.cost <= me.spendablePoints);
    if (tab === 'Goals') list = list.filter((reward) => reward.favorite || reward.primaryGoal);
    if (category) list = list.filter((reward) => reward.category === category);
    return list;
  }, [tab, category]);

  return (
    <>
      <ScreenTop
        title="Rewards"
        trailing={<PointsPill value={me.spendablePoints} small />}
      />
      <main className="screen">
        <Segmented options={TABS} value={tab} onChange={setTab} label="Reward filter" />

        <div className="chip-row" role="group" aria-label="Reward categories" style={{ marginTop: 'var(--space-3)' }}>
          <button type="button" className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>
            All categories
          </button>
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

        <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
          {visible.map((reward) => {
            const affordable = reward.cost <= me.spendablePoints && !reward.lockedUntil;
            return (
              <article key={reward.id} className="card stack stack--tight">
                <div className="row" style={{ gap: 'var(--space-3)' }}>
                  <span className="tile-icon tile-icon--purple">
                    <Icon name={reward.icon} size={24} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row row--between">
                      <strong>{reward.name}</strong>
                      {reward.primaryGoal ? <Badge tone="info" icon="star">Goal</Badge> : null}
                    </div>
                    <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                      {reward.description}
                    </p>
                  </div>
                </div>

                <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <PointsPill value={reward.cost} small />
                  {reward.needsApproval ? <Badge tone="neutral" icon="user">Parent approves</Badge> : null}
                  {reward.lockedUntil ? (
                    <Badge tone="waiting" icon="lock">
                      {reward.lockedUntil}
                    </Badge>
                  ) : null}
                </div>

                {!affordable && !reward.lockedUntil && (
                  <Meter
                    value={me.spendablePoints}
                    max={reward.cost}
                    label="Progress"
                    right={`${me.spendablePoints} / ${reward.cost}`}
                    tone="gold"
                  />
                )}

                <Button
                  tone={affordable ? 'gold' : 'quiet'}
                  block
                  disabled={!affordable}
                  onClick={() => setRedeeming(reward)}
                >
                  {reward.lockedUntil ? 'Locked' : affordable ? 'Redeem' : 'Keep earning'}
                </Button>
              </article>
            );
          })}
        </div>

        <Button
          tone="quiet"
          block
          icon="plus"
          style={{ marginTop: 'var(--space-4)' }}
          onClick={() => setSuggesting(true)}
        >
          Suggest a reward
        </Button>
      </main>

      {redeeming && (
        <Sheet title="Redeem this reward?" onClose={() => setRedeeming(null)}>
          <p style={{ marginTop: 0 }}>
            <strong>{redeeming.name}</strong> costs {points(redeeming.cost)}. Your points are held
            until a parent approves it.
          </p>
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <Button tone="quiet" block onClick={() => setRedeeming(null)}>
              Cancel
            </Button>
            <Button
              tone="gold"
              block
              onClick={() => {
                playSound('redeem');
                setRedeeming(null);
              }}
            >
              Redeem
            </Button>
          </div>
        </Sheet>
      )}

      {suggesting && (
        <Sheet
          title="Suggest a reward"
          onClose={() => setSuggesting(false)}
          footer={
            <Button tone="primary" block onClick={() => setSuggesting(false)}>
              Send to parents
            </Button>
          }
        >
          <div className="stack">
            <label className="field">
              <span className="field__label">What is the reward?</span>
              <input className="input" placeholder="Example: pick the weekend breakfast" />
            </label>
            <label className="field">
              <span className="field__label">Why do you want it?</span>
              <textarea className="textarea" placeholder="Optional" />
            </label>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              A parent decides the point cost and the rules before it appears in the store.
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}
