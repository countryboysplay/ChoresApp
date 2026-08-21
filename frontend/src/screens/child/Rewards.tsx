import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChildRewardsResponse, RewardItem } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, EmptyState, Meter, PointsPill, Segmented, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { playSound } from '../../design/sound';
import { api, ApiRequestError } from '../../lib/api';

const TABS = ['All', 'Available', 'Goals'] as const;

export function Rewards() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('All');
  const [data, setData] = useState<ChildRewardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState<RewardItem | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.rewards.mine());
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

  const spendable = data?.spendablePoints ?? 0;

  const visible = useMemo(() => {
    const all = data?.rewards ?? [];
    if (tab === 'Available') return all.filter((reward) => reward.cost <= spendable && !reward.lockedUntil);
    if (tab === 'Goals') return all.filter((reward) => reward.isFavorite || reward.isPrimaryGoal);
    return all;
  }, [data, tab, spendable]);

  const redeem = async () => {
    if (!redeeming) return;
    setWorking(true);
    try {
      await api.rewards.redeem(redeeming.id);
      playSound('redeem');
      setRedeeming(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not work.');
      setRedeeming(null);
    } finally {
      setWorking(false);
    }
  };

  const toggleGoal = async (reward: RewardItem) => {
    try {
      await api.rewards.setPreference(reward.id, { isPrimaryGoal: !reward.isPrimaryGoal });
      await load();
    } catch {
      setError('That did not save.');
    }
  };

  if (loading) {
    return (
      <>
        <ScreenTop title="Rewards" />
        <main className="screen">
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
      <main className="screen">
        <div className="row row--between" style={{ marginBottom: 'var(--space-4)' }}>
          <span className="eyebrow">Points to spend</span>
          <PointsPill value={spendable} />
        </div>

        <Segmented options={TABS} value={tab} onChange={setTab} label="Filter rewards" />

        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            {error}
          </p>
        )}

        {visible.length === 0 ? (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <EmptyState
              icon="gift"
              title={tab === 'All' ? 'No rewards yet' : 'Nothing here yet'}
              message={
                tab === 'All'
                  ? 'A parent sets these up. Ask them what you can save for.'
                  : tab === 'Available'
                    ? 'Keep earning points and rewards will unlock here.'
                    : 'Tap the star on a reward to make it your goal.'
              }
            />
          </div>
        ) : (
          <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
            {visible.map((reward) => {
              const affordable = reward.cost <= spendable && !reward.lockedUntil;
              return (
                <article key={reward.id} className="card stack stack--tight">
                  <div className="row" style={{ gap: 'var(--space-3)' }}>
                    <span className="tile-icon tile-icon--purple tile-icon--sm">
                      <Icon name={reward.icon as IconName} size={20} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 800, display: 'block' }}>{reward.name}</span>
                      {reward.description && (
                        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                          {reward.description}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={reward.isPrimaryGoal ? `Stop saving for ${reward.name}` : `Save for ${reward.name}`}
                      aria-pressed={reward.isPrimaryGoal}
                      onClick={() => void toggleGoal(reward)}
                    >
                      <Icon
                        name="star"
                        size={18}
                        style={{ color: reward.isPrimaryGoal ? 'var(--gold)' : 'var(--text-muted)' }}
                      />
                    </button>
                  </div>

                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    <PointsPill value={reward.cost} small />
                    {reward.needsApproval && (
                      <Badge tone="neutral" icon="user">Parent approves</Badge>
                    )}
                    {reward.lockedUntil && <Badge tone="waiting" icon="lock">Locked</Badge>}
                    {reward.requestPending && <Badge tone="waiting" icon="clock">Waiting</Badge>}
                  </div>

                  {!affordable && !reward.lockedUntil && (
                    <>
                      <Meter
                        value={Math.min(spendable, reward.cost)}
                        max={reward.cost}
                        tone="gold"
                        label={`Progress towards ${reward.name}`}
                      />
                      <span className="muted numeric" style={{ fontSize: 'var(--text-sm)' }}>
                        {spendable} / {reward.cost}
                      </span>
                    </>
                  )}

                  <Button
                    tone={affordable ? 'purple' : 'quiet'}
                    block
                    disabled={!affordable || reward.requestPending}
                    onClick={() => setRedeeming(reward)}
                  >
                    {reward.lockedUntil
                      ? 'Locked'
                      : reward.requestPending
                        ? 'Waiting for a parent'
                        : affordable
                          ? 'Redeem'
                          : 'Keep earning'}
                  </Button>
                </article>
              );
            })}
          </div>
        )}

        {(data?.redemptions.length ?? 0) > 0 && (
          <section style={{ marginTop: 'var(--space-5)' }}>
            <h2 className="subtitle">Your requests</h2>
            <div className="stack stack--tight">
              {data?.redemptions.slice(0, 5).map((entry) => (
                <div key={entry.id} className="card stack stack--tight">
                  <div className="row" style={{ gap: 'var(--space-3)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 700 }}>{entry.rewardName}</span>
                    {entry.status === 'requested' ? (
                      <Badge tone="waiting" icon="clock">Waiting</Badge>
                    ) : entry.status === 'denied' ? (
                      <Badge tone="late" icon="alert">Not this time</Badge>
                    ) : (
                      <Badge tone="done" icon="check">Yours</Badge>
                    )}
                  </div>
                  {/* A chore sent back has always come with a reason. A reward
                      refused carried one end to end - the column, the endpoint,
                      the field on the response - and nothing ever wrote it or
                      read it, so "no" arrived on its own. */}
                  {entry.status === 'denied' && entry.note && (
                    <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                      {entry.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {redeeming && (
        <Sheet title="Redeem this reward?" onClose={() => setRedeeming(null)}>
          <div className="stack">
            <p style={{ margin: 0 }}>
              <strong>{redeeming.name}</strong> costs {redeeming.cost} points. Your points are held
              straight away while a parent decides, and come back if they say no.
            </p>
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <Button tone="quiet" block onClick={() => setRedeeming(null)}>
                Cancel
              </Button>
              <Button tone="purple" block disabled={working} onClick={() => void redeem()}>
                {working ? 'Sending…' : 'Redeem'}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
