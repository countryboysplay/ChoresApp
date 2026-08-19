import { useState } from 'react';
import { Icon } from '../../design/icons';
import { Button, Meter, PointsPill, Sheet, Tile } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { relativeTime } from '../../config/format';
import { children, ledger, settings } from '../../mock/data';

const me = children[0]!;
const usedThisWeek = 0;

export function Wallet() {
  const [cashOutOpen, setCashOutOpen] = useState(false);
  const conversionReady = settings.pointsPerDollar !== null && settings.minimumCashOutPoints !== null;

  return (
    <>
      <ScreenTop title="Wallet" />
      <main className="screen">
        <section className="panel panel--sky" style={{ textAlign: 'center' }}>
          <span className="eyebrow">Cash value</span>
          <p
            className="title numeric"
            style={{ fontSize: 'var(--text-3xl)', margin: 'var(--space-2) 0' }}
          >
            {conversionReady ? '$0.00' : '—'}
          </p>
          <PointsPill value={`${me.spendablePoints.toLocaleString('en-US')} pts spendable`} />
        </section>

        {!conversionReady && (
          <div className="card card--status is-waiting" style={{ marginTop: 'var(--space-4)' }}>
            <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
              <Icon name="alert" size={20} />
              <strong>Cash-out is turned off</strong>
            </div>
            <p style={{ margin: 0 }}>
              A parent needs to set the points-to-dollars rate and the minimum balance in Settings
              before allowance can be requested.
            </p>
          </div>
        )}

        <div className="grid-2" style={{ marginTop: 'var(--space-4)' }}>
          <Tile value={me.spendablePoints} label="Spendable points" />
          <Tile value={me.lifetimePoints} label="Lifetime points" />
        </div>

        <section className="card" style={{ marginTop: 'var(--space-4)' }}>
          <Meter
            value={usedThisWeek}
            max={settings.weeklyCashOutCapDollars}
            label="Cash-out used this week"
            right={`$${usedThisWeek} used · $${settings.weeklyCashOutCapDollars - usedThisWeek} available`}
            tone="green"
          />
          <p className="muted" style={{ marginBottom: 0, fontSize: 'var(--text-sm)' }}>
            Resets Sunday at midnight.
          </p>
        </section>

        <Button
          tone="gold"
          size="lg"
          block
          disabled={!conversionReady}
          style={{ marginTop: 'var(--space-4)' }}
          onClick={() => setCashOutOpen(true)}
        >
          Request allowance
        </Button>

        <section style={{ marginTop: 'var(--space-5)' }}>
          <h2 className="subtitle">Points history</h2>
          <div className="stack stack--tight">
            {ledger.map((entry) => (
              <div key={entry.id} className="card row">
                <span className={`tile-icon tile-icon--sm ${entry.delta > 0 ? 'tile-icon--green' : 'tile-icon--purple'}`}>
                  <Icon name={entry.delta > 0 ? 'check' : 'gift'} size={20} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, display: 'block' }}>{entry.label}</span>
                  <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                    {relativeTime(entry.minutesAgo)}
                  </span>
                </span>
                <strong className="numeric" style={{ color: entry.delta > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                  {entry.delta > 0 ? '+' : ''}
                  {entry.delta}
                </strong>
              </div>
            ))}
          </div>
        </section>
      </main>

      {cashOutOpen && (
        <Sheet title="Request allowance" onClose={() => setCashOutOpen(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Pick an amount. A parent approves and marks it paid.
          </p>
          <div className="grid-2">
            {settings.cashOutPresets.map((amount) => (
              <button key={amount} type="button" className="btn btn--quiet">
                ${amount}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
