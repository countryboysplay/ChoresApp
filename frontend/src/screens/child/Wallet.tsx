import { useCallback, useEffect, useState } from 'react';
import type { WalletResponse } from '@chore-quest/shared';
import { Icon } from '../../design/icons';
import { Badge, Meter } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';

/**
 * The wallet.
 *
 * Cash-out renders its "turned off" state until an owner sets the
 * points-to-dollars rate and the minimum balance. Those are deliberately unset
 * - the specification forbids inventing either - so the server sends a plain
 * `configured: false` rather than leaving this screen to guess from nulls.
 */
export function Wallet() {
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setWallet(await api.wallet.mine());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load your wallet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <>
        <ScreenTop title="Wallet" />
        <main className="screen">
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            Loading&hellip;
          </p>
        </main>
      </>
    );
  }

  if (!wallet) {
    return (
      <>
        <ScreenTop title="Wallet" />
        <main className="screen">
          <div className="card card--status is-late">
            <p style={{ fontWeight: 700, margin: 0 }}>{error ?? 'Could not load your wallet.'}</p>
          </div>
        </main>
      </>
    );
  }

  const { cashOut } = wallet;

  return (
    <>
      <ScreenTop title="Wallet" />
      <main className="screen">
        <section className="panel panel--sky" style={{ textAlign: 'center' }}>
          <span className="eyebrow">Points to spend</span>
          <p
            className="numeric"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-3xl)',
              margin: 'var(--space-2) 0 0',
            }}
          >
            {wallet.spendablePoints.toLocaleString('en-US')}
          </p>
          <div className="row" style={{ justifyContent: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
              {wallet.lifetimePoints.toLocaleString('en-US')} earned
            </span>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
              {wallet.spentPoints.toLocaleString('en-US')} spent
            </span>
          </div>
        </section>

        <section style={{ marginTop: 'var(--space-5)' }}>
          <h2 className="subtitle">Cash out</h2>
          {cashOut.configured ? (
            <div className="card stack">
              <div className="meter-label">
                <span>This week</span>
                <span className="numeric">
                  ${(cashOut.usedThisWeekCents / 100).toFixed(2)} of $
                  {(cashOut.weeklyCapCents / 100).toFixed(2)}
                </span>
              </div>
              <Meter
                value={cashOut.usedThisWeekCents}
                max={cashOut.weeklyCapCents}
                tone="gold"
                label="Weekly cash-out used"
              />
              <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                {cashOut.pointsPerDollar} points is $1. You need at least {cashOut.minimumPoints} points
                to cash out.
              </p>
            </div>
          ) : (
            // Not an error state. Nobody has set the household's rate yet, and
            // the app will not invent one.
            <div className="card row" style={{ gap: 'var(--space-3)' }}>
              <Icon name="lock" size={22} />
              <p style={{ margin: 0 }} className="muted">
                Cash out is turned off. A parent needs to set how many points make a dollar in
                Settings first.
              </p>
            </div>
          )}
        </section>

        <section style={{ marginTop: 'var(--space-5)' }}>
          <h2 className="subtitle">History</h2>
          {wallet.history.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Nothing yet. Points show up here as soon as a chore is approved.
            </p>
          ) : (
            <div className="stack stack--tight">
              {wallet.history.map((entry) => (
                <div key={entry.id} className="card row" style={{ gap: 'var(--space-3)' }}>
                  <Icon
                    name={entry.delta > 0 ? 'check' : 'gift'}
                    size={20}
                    style={{ color: entry.delta > 0 ? 'var(--green)' : 'var(--purple)' }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, display: 'block' }}>{entry.label}</span>
                    <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                      {new Date(entry.at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </span>
                  {entry.delta > 0 ? (
                    <Badge tone="done">+{entry.delta}</Badge>
                  ) : (
                    <Badge tone="neutral">{entry.delta}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
