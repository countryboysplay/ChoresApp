import { useCallback, useEffect, useState } from 'react';
import type { CashOutRequest, WalletResponse } from '@chore-quest/shared';
import { Icon } from '../../design/icons';
import { Badge, Button, Meter } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';

/**
 * The wallet.
 *
 * Cash-out renders its "turned off" state until an owner sets the
 * points-to-dollars rate and the minimum balance. Those are deliberately unset
 * to begin with - the specification forbids inventing either - so the server
 * sends a plain `configured: false` rather than leaving this screen to guess
 * from nulls.
 *
 * Once they are set this screen has to offer something to press. It explained
 * the exchange rate, drew the weekly meter and stopped there for as long as it
 * existed, which was invisible while the rate was null and became a promise
 * with no way to take it up the moment an owner filled the pair in.
 */
export function Wallet() {
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [mine, setMine] = useState<CashOutRequest[]>([]);
  const [dollars, setDollars] = useState('');
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [loaded, requests] = await Promise.all([api.wallet.mine(), api.cashOut.mine()]);
      setWallet(loaded);
      setMine(requests.requests);
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

  /*
   * What this child could ask for right now: whole dollars only, limited by
   * what they have, and by what is left of the household's week. Whole dollars
   * because pocket money is, and because a request for $3.47 is a rounding
   * argument nobody wants to have on a Saturday.
   */
  // Narrowed once here rather than at every use: `configured` is the server
  // saying both are set, but it cannot tell the compiler that.
  const rate = cashOut.pointsPerDollar ?? 0;
  const minimumPoints = cashOut.minimumPoints ?? 0;

  const remainingCents = cashOut.configured
    ? Math.max(0, cashOut.weeklyCapCents - cashOut.usedThisWeekCents)
    : 0;
  const affordableDollars =
    cashOut.configured && rate
      ? Math.floor(wallet.spendablePoints / rate)
      : 0;
  const maxDollars = Math.min(affordableDollars, Math.floor(remainingCents / 100));
  const canAsk =
    cashOut.configured &&
    minimumPoints > 0 &&
    wallet.spendablePoints >= minimumPoints &&
    maxDollars >= 1;
  const wanted = Number(dollars) > 0 ? Math.floor(Number(dollars)) : 0;

  const ask = async () => {
    setAsking(true);
    setError(null);
    setNotice(null);
    try {
      await api.cashOut.ask(wanted * 100);
      setDollars('');
      setNotice('Asked. A parent will say yes or no.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not go through.');
    } finally {
      setAsking(false);
    }
  };

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

              {notice && (
                <p role="status" className="badge badge--done" style={{ padding: 'var(--space-2)' }}>
                  {notice}
                </p>
              )}

              {canAsk ? (
                <>
                  <label className="field">
                    <span className="field__label">How much?</span>
                    <input
                      className="input numeric"
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={maxDollars}
                      step={1}
                      value={dollars}
                      placeholder={`1 to ${maxDollars}`}
                      onChange={(event) => setDollars(event.target.value)}
                    />
                  </label>
                  <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                    {wanted > 0
                      ? `That is ${wanted * rate} points, leaving you ${wallet.spendablePoints - wanted * rate}.`
                      : `You can ask for up to $${maxDollars} right now.`}
                  </p>
                  <Button
                    tone="go"
                    block
                    disabled={asking || wanted <= 0 || wanted > maxDollars}
                    onClick={() => void ask()}
                  >
                    {asking ? 'Asking…' : 'Ask to cash out'}
                  </Button>
                </>
              ) : (
                // Said plainly, and which of the two reasons it is. "You cannot"
                // with no reason is the kind of thing a child reads as broken.
                <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                  {wallet.spendablePoints < minimumPoints
                    ? `Keep going - ${minimumPoints - wallet.spendablePoints} more points and you can ask.`
                    : 'That is the whole of this week already. You can ask again next week.'}
                </p>
              )}

              {mine.length > 0 && (
                <div className="stack stack--tight">
                  <span className="eyebrow">What you have asked for</span>
                  {mine.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="row row--between" style={{ fontSize: 'var(--text-sm)' }}>
                      <span className="muted">
                        ${(entry.amountCents / 100).toFixed(2)} · {entry.points} points
                      </span>
                      <Badge
                        tone={
                          entry.status === 'paid'
                            ? 'done'
                            : entry.status === 'denied'
                              ? 'late'
                              : entry.status === 'approved'
                                ? 'info'
                                : 'waiting'
                        }
                      >
                        {entry.status === 'requested'
                          ? 'Waiting'
                          : entry.status === 'approved'
                            ? 'Coming'
                            : entry.status === 'paid'
                              ? 'Paid'
                              : 'Not this time'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
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
