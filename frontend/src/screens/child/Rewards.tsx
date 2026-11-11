import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { ChildRewardsResponse, RewardItem } from '@chore-quest/shared';
import { Icon } from '../../design/icons';
import { NeonArt, rewardArt } from '../../design/neon';
import { Badge, Button, Meter, PointsPill, Segmented, Sheet, EmptyState } from '../../design/primitives';
import { useAuth } from '../../lib/auth';
import { CelebrationQueue, rewardMoments } from './celebrations';
import { ScreenTop } from '../../components/ScreenTop';
import { playSound } from '../../design/sound';
import { api, ApiRequestError } from '../../lib/api';
import { prefersReducedMotion } from '../../lib/motion';
import '../../design/neon-polish.css';

const TABS = ['All', 'Available', 'Goals'] as const;
const ALL = 'All';

/** Rewards shown for a category chip and an Available/Goals tab together. */
export function filterRewards(
  rewards: RewardItem[],
  category: string,
  tab: (typeof TABS)[number],
  spendable: number,
): RewardItem[] {
  return rewards.filter(
    (reward) =>
      (category === ALL || reward.category === category) &&
      (tab === 'Available'
        ? reward.cost <= spendable && !reward.lockedUntil
        : tab === 'Goals'
          ? reward.isFavorite || reward.isPrimaryGoal
          : true),
  );
}

type Flight = { from: DOMRect; to: DOMRect; id: number };
const FLIGHT_COINS = 6;

/** Coins arc from the balance into the reward just bought. Decorative only. */
function CoinFlight({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const x0 = flight.from.left + flight.from.width / 2;
  const y0 = flight.from.top + flight.from.height / 2;
  const dx = flight.to.left + flight.to.width / 2 - x0;
  const dy = flight.to.top + flight.to.height / 3 - y0;
  return (
    <div aria-hidden="true" style={{ position: 'fixed', left: x0 - 10, top: y0 - 10, zIndex: 60, pointerEvents: 'none' }}>
      {Array.from({ length: FLIGHT_COINS }, (_, i) => (
        <motion.span
          key={i}
          style={{ position: 'absolute', color: 'var(--gold)', display: 'flex' }}
          initial={{ x: 0, y: 0, scale: 0.8, opacity: 0 }}
          animate={{
            x: [0, dx / 2 + (i - FLIGHT_COINS / 2) * 9, dx],
            y: [0, Math.min(0, dy) / 2 - 70, dy],
            scale: [0.8, 1.25, 0.5],
            opacity: [1, 1, 0],
          }}
          transition={{ duration: 0.7, delay: i * 0.07, ease: 'easeInOut' }}
          onAnimationComplete={i === FLIGHT_COINS - 1 ? onDone : undefined}
        >
          <Icon name="coin" size={20} />
        </motion.span>
      ))}
    </div>
  );
}

export function Rewards() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('All');
  const [category, setCategory] = useState(ALL);
  const [data, setData] = useState<ChildRewardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState<RewardItem | null>(null);
  const [working, setWorking] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

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
  const { mode, user } = useAuth();
  const userId = mode === 'live' ? user?.id : undefined;
  // Same keys as Home: a yes from a parent is celebrated once, wherever it is seen first.
  const moments = useMemo(
    () => (userId && data ? rewardMoments(userId, data.redemptions) : []),
    [userId, data],
  );

  // Categories come from the household's own rewards, in the order they appear.
  const categories = useMemo(() => [...new Set((data?.rewards ?? []).map((reward) => reward.category))], [data]);
  // A category that vanished (its last reward retired) falls back to All.
  const activeCategory = categories.includes(category) ? category : ALL;
  const visible = useMemo(
    () => filterRewards(data?.rewards ?? [], activeCategory, tab, spendable),
    [data, activeCategory, tab, spendable],
  );

  const redeem = async () => {
    if (!redeeming) return;
    setWorking(true);
    try {
      await api.rewards.redeem(redeeming.id);
      playSound('redeem');
      const from = pillRef.current?.getBoundingClientRect();
      const to = document.querySelector(`[data-reward-id="${redeeming.id}"]`)?.getBoundingClientRect();
      if (from && to && !prefersReducedMotion()) setFlight({ from, to, id: Date.now() });
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
        <CelebrationQueue moments={moments} />
        <div className="row row--between" style={{ marginBottom: 'var(--space-4)' }}>
          <span className="eyebrow">Coins to spend</span>
          <span ref={pillRef}>
            <PointsPill value={spendable} />
          </span>
        </div>
        {flight && <CoinFlight key={flight.id} flight={flight} onDone={() => setFlight(null)} />}

        {categories.length > 1 && (
          <div className="chip-row" role="group" aria-label="Reward category" style={{ marginBottom: 'var(--space-3)' }}>
            {[ALL, ...categories].map((option) => (
              <button
                key={option}
                type="button"
                className="chip"
                aria-pressed={activeCategory === option}
                onClick={() => setCategory(option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        <Segmented options={TABS} value={tab} onChange={setTab} label="Filter rewards" />

        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            {error}
          </p>
        )}

        {visible.length === 0 ? (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <EmptyState
              art="no-rewards"
              title={tab === 'All' && activeCategory === ALL ? 'No rewards yet' : 'Nothing here yet'}
              message={
                tab === 'All' && activeCategory === ALL
                  ? 'A parent sets these up. Ask them what you can save for.'
                  : tab === 'Available'
                    ? 'Keep earning coins and rewards will unlock here.'
                    : tab === 'Goals'
                      ? 'Tap the star on a reward to make it your goal.'
                      : 'No rewards in this category yet.'
              }
            />
          </div>
        ) : (
          <div className="neon-rewards" style={{ marginTop: 'var(--space-4)' }}>
            {visible.map((reward) => {
              const affordable = reward.cost <= spendable && !reward.lockedUntil;
              const state = reward.lockedUntil ? 'is-locked' : affordable && !reward.requestPending ? 'is-ready' : '';
              return (
                <article key={reward.id} data-reward-id={reward.id} className={`neon-reward ${state}`}>
                  <button
                    type="button"
                    className="iconbtn neon-reward__goal"
                    aria-label={reward.isPrimaryGoal ? `Stop saving for ${reward.name}` : `Save for ${reward.name}`}
                    aria-pressed={reward.isPrimaryGoal}
                    onClick={() => void toggleGoal(reward)}
                  >
                    <Icon
                      name="star"
                      size={16}
                      style={{ color: reward.isPrimaryGoal ? 'var(--gold)' : 'var(--text-muted)' }}
                    />
                  </button>
                  <NeonArt group="rewards" name={rewardArt(reward.name)} size={76} />
                  <strong>{reward.name}</strong>
                  {reward.description && <span className="neon-reward__desc">{reward.description}</span>}
                  <span className="neon-reward__cost numeric">
                    <Icon name="coin" size={16} />
                    {reward.cost.toLocaleString('en-US')} coins
                  </span>

                  {(reward.needsApproval || reward.lockedUntil || reward.requestPending) && (
                    <span className="neon-reward__tags">
                      {reward.needsApproval && !reward.requestPending && (
                        <Badge tone="neutral" icon="user">Parent OK</Badge>
                      )}
                      {reward.lockedUntil && <Badge tone="waiting" icon="lock">Locked</Badge>}
                      {reward.requestPending && <Badge tone="waiting" icon="hourglass">Waiting</Badge>}
                    </span>
                  )}

                  {!affordable && !reward.lockedUntil && (
                    <div className="neon-meter">
                      <Meter
                        value={Math.min(spendable, reward.cost)}
                        max={reward.cost}
                        tone="gold"
                        name={`Progress towards ${reward.name}`}
                      />
                      <span>
                        {spendable.toLocaleString('en-US')} / {reward.cost.toLocaleString('en-US')}
                      </span>
                    </div>
                  )}

                  <Button
                    tone={affordable ? 'purple' : 'quiet'}
                    block
                    icon={
                      reward.lockedUntil
                        ? 'lock'
                        : reward.requestPending
                          ? 'hourglass'
                          : affordable
                            ? 'cash'
                            : undefined
                    }
                    disabled={!affordable || reward.requestPending}
                    onClick={() => setRedeeming(reward)}
                  >
                    {reward.lockedUntil
                      ? 'Locked'
                      : reward.requestPending
                        ? 'Waiting'
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
                    <NeonArt group="rewards" name={rewardArt(entry.rewardName)} size={36} />
                    {entry.status === 'requested' ? (
                      <Badge tone="waiting" icon="hourglass">Waiting</Badge>
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
              <strong>{redeeming.name}</strong> costs {redeeming.cost} coins. Your coins are held
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
