import { useCallback, useEffect, useState } from 'react';
import type { ManagedReward, RewardRequest } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { Button, EmptyState, PointsPill, Segmented, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';

const TABS = ['Requests', 'Catalogue'] as const;
const CATEGORIES = ['Screen Time', 'Food', 'Activities', 'Privileges'] as const;
const ICONS: IconName[] = ['screen', 'food', 'activity', 'clock', 'gift', 'star', 'user'];

interface Draft {
  id?: string;
  name: string;
  description: string;
  cost: string;
  category: string;
  icon: IconName;
  needsApproval: boolean;
}

const BLANK: Draft = {
  name: '',
  description: '',
  cost: '',
  category: 'Screen Time',
  icon: 'gift',
  needsApproval: true,
};

/**
 * Rewards, as a parent manages them.
 *
 * Retiring rather than deleting, because past redemptions point at these rows
 * and a child's history should not lose the name of what they saved up for.
 */
export function RewardManage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Requests');
  const [rewards, setRewards] = useState<ManagedReward[]>([]);
  const [pending, setPending] = useState<RewardRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const [catalogue, requests] = await Promise.all([
        api.rewards.catalogue(),
        api.rewards.requests(),
      ]);
      setRewards(catalogue.rewards);
      setPending(requests.pending);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load rewards.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    const cost = Number(draft.cost);
    if (!draft.name.trim() || !Number.isInteger(cost) || cost <= 0) {
      setError('A reward needs a name and a whole number of points above zero.');
      return;
    }

    setWorking(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        costPoints: cost,
        category: draft.category,
        icon: draft.icon,
        needsApproval: draft.needsApproval,
      };
      if (draft.id) await api.rewards.update(draft.id, payload);
      else await api.rewards.create(payload);

      setDraft(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not save.');
    } finally {
      setWorking(false);
    }
  };

  const decide = async (id: string, outcome: 'approve' | 'deny') => {
    setWorking(true);
    try {
      if (outcome === 'approve') await api.rewards.approveRequest(id);
      else await api.rewards.denyRequest(id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not work.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <>
        <ScreenTop title="Rewards" />
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
      <ScreenTop title="Rewards" />
      <main className="screen screen--wide">
        <Segmented options={TABS} value={tab} onChange={setTab} label="Rewards" />

        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            {error}
          </p>
        )}

        {tab === 'Requests' ? (
          pending.length === 0 ? (
            <div style={{ marginTop: 'var(--space-5)' }}>
              <EmptyState
                icon="check"
                title="No requests waiting"
                message="Reward requests from the kids appear here."
              />
            </div>
          ) : (
            <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
              {pending.map((entry) => (
                <article key={entry.id} className="card stack stack--tight">
                  <div className="row" style={{ gap: 'var(--space-3)' }}>
                    <span className="tile-icon tile-icon--purple tile-icon--sm">
                      <Icon name={entry.rewardIcon as IconName} size={20} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 800, display: 'block' }}>{entry.rewardName}</span>
                      <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                        {entry.child.displayName}
                      </span>
                    </span>
                    <PointsPill value={entry.cost} small />
                  </div>
                  <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                    Their points are already held. Saying no puts them straight back.
                  </p>
                  <div className="row" style={{ gap: 'var(--space-3)' }}>
                    <Button tone="stop" block disabled={working} onClick={() => void decide(entry.id, 'deny')}>
                      Not this time
                    </Button>
                    <Button tone="go" block disabled={working} onClick={() => void decide(entry.id, 'approve')}>
                      Approve
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : (
          <>
            <Button
              tone="purple"
              size="lg"
              block
              icon="plus"
              style={{ marginTop: 'var(--space-4)' }}
              onClick={() => setDraft({ ...BLANK })}
            >
              Add a reward
            </Button>

            {rewards.length === 0 ? (
              <div style={{ marginTop: 'var(--space-5)' }}>
                <EmptyState
                  icon="gift"
                  title="Nothing to save for yet"
                  message="Add the first reward and it shows up on the kids' rewards screen."
                />
              </div>
            ) : (
              <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
                {rewards.map((reward) => (
                  <article
                    key={reward.id}
                    className="card row"
                    style={{ gap: 'var(--space-3)', opacity: reward.isActive ? 1 : 0.55 }}
                  >
                    <span className="tile-icon tile-icon--purple tile-icon--sm">
                      <Icon name={reward.icon as IconName} size={20} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 800, display: 'block' }}>{reward.name}</span>
                      <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                        {reward.category}
                        {reward.isActive ? '' : ' · retired'}
                      </span>
                    </span>
                    <PointsPill value={reward.cost} small />
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={`Edit ${reward.name}`}
                      onClick={() =>
                        setDraft({
                          id: reward.id,
                          name: reward.name,
                          description: reward.description,
                          cost: String(reward.cost),
                          category: reward.category,
                          icon: reward.icon as IconName,
                          needsApproval: reward.needsApproval,
                        })
                      }
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
        <Sheet title={draft.id ? 'Edit reward' : 'New reward'} onClose={() => setDraft(null)}>
          <div className="stack">
            <label className="stack stack--tight">
              <span className="eyebrow">Name</span>
              <input
                className="input"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Example: one hour of extra screen time"
              />
            </label>

            <label className="stack stack--tight">
              <span className="eyebrow">Description</span>
              <input
                className="input"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="Short and clear"
              />
            </label>

            <label className="stack stack--tight">
              <span className="eyebrow">Cost in points</span>
              <input
                className="input numeric"
                type="number"
                min={1}
                value={draft.cost}
                onChange={(event) => setDraft({ ...draft, cost: event.target.value })}
                placeholder="120"
              />
            </label>

            <div className="stack stack--tight">
              <span className="eyebrow">Category</span>
              <div className="chip-row" role="group" aria-label="Category">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className="chip"
                    aria-pressed={draft.category === category}
                    onClick={() => setDraft({ ...draft, category })}
                  >
                    {category}
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

            <div className="row" style={{ gap: 'var(--space-3)' }}>
              {draft.id && (
                <Button
                  tone="stop"
                  block
                  disabled={working}
                  onClick={async () => {
                    await api.rewards.retire(draft.id as string);
                    setDraft(null);
                    await load();
                  }}
                >
                  Retire
                </Button>
              )}
              <Button tone="go" block disabled={working} onClick={() => void save()}>
                {working ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
