import { useCallback, useEffect, useState } from 'react';
import type { HouseholdSettings } from '@chore-quest/shared';
import { Icon } from '../../design/icons';
import { Badge, Button } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { InstallPrompt } from '../../components/InstallPrompt';
import { api, ApiRequestError } from '../../lib/api';

/**
 * Household settings.
 *
 * The points-to-dollars rate and the minimum cash-out balance are the two values
 * the app has always refused to invent. They are set here, together, and setting
 * them is what turns the wallet's cash-out panel on.
 */
export function Settings() {
  const [settings, setSettings] = useState<HouseholdSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const [corePoints, setCorePoints] = useState('');
  const [bonusPoints, setBonusPoints] = useState('');
  const [reminder, setReminder] = useState('');
  const [escalation, setEscalation] = useState('');
  const [rate, setRate] = useState('');
  const [minimum, setMinimum] = useState('');

  const load = useCallback(async () => {
    try {
      const { settings: loaded } = await api.household.settings();
      setSettings(loaded);
      setCorePoints(String(loaded.corePointValue));
      setBonusPoints(String(loaded.punctualityBonusPoints));
      setReminder(loaded.reminderTime);
      setEscalation(loaded.escalationTime);
      setRate(loaded.pointsPerDollar === null ? '' : String(loaded.pointsPerDollar));
      setMinimum(loaded.minimumCashOutPoints === null ? '' : String(loaded.minimumCashOutPoints));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePoints = async () => {
    setWorking(true);
    setError(null);
    try {
      await api.household.saveSettings({
        corePointValue: Number(corePoints),
        punctualityBonusPoints: Number(bonusPoints),
        reminderTime: reminder,
        escalationTime: escalation,
      });
      setNotice('Saved.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not save.');
    } finally {
      setWorking(false);
    }
  };

  const saveCashOut = async (turnOff = false) => {
    setWorking(true);
    setError(null);
    try {
      await api.household.saveSettings(
        turnOff
          ? { pointsPerDollar: null, minimumCashOutPoints: null }
          : { pointsPerDollar: Number(rate), minimumCashOutPoints: Number(minimum) },
      );
      setNotice(turnOff ? 'Cash out turned off.' : 'Cash out is on.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'That did not save.');
    } finally {
      setWorking(false);
    }
  };

  if (loading || !settings) {
    return (
      <>
        <ScreenTop title="Settings" />
        <main className="screen screen--wide">
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            {error ?? 'Loading…'}
          </p>
        </main>
      </>
    );
  }

  const cashOutReady = Number(rate) > 0 && Number(minimum) >= 0 && minimum !== '';

  return (
    <>
      <ScreenTop title="Settings" />
      <main className="screen screen--wide">
        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="badge badge--done" style={{ padding: 'var(--space-3)' }}>
            {notice}
          </p>
        )}

        <section className="card stack" style={{ marginTop: 'var(--space-4)' }}>
          <h2 className="subtitle">Points</h2>
          <div className="grid-2">
            <label className="field">
              <span className="field__label">Points per core chore</span>
              <input
                className="input numeric"
                type="number"
                min={1}
                value={corePoints}
                onChange={(event) => setCorePoints(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Punctuality bonus</span>
              <input
                className="input numeric"
                type="number"
                min={0}
                value={bonusPoints}
                onChange={(event) => setBonusPoints(event.target.value)}
              />
            </label>
          </div>

          <div className="grid-2">
            <label className="field">
              <span className="field__label">Reminder</span>
              <input
                className="input"
                type="time"
                value={reminder}
                onChange={(event) => setReminder(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Escalation</span>
              <input
                className="input"
                type="time"
                value={escalation}
                onChange={(event) => setEscalation(event.target.value)}
              />
            </label>
          </div>

          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            The reminder time is also the punctuality deadline: a chore sent in before it earns the
            bonus.
          </p>

          <Button tone="go" block disabled={working} onClick={() => void savePoints()}>
            {working ? 'Saving…' : 'Save points'}
          </Button>
        </section>

        <section className="card stack" style={{ marginTop: 'var(--space-4)' }}>
          <div className="row row--between">
            <h2 className="subtitle" style={{ margin: 0 }}>Allowance</h2>
            {settings.cashOutConfigured ? (
              <Badge tone="done" icon="check">On</Badge>
            ) : (
              <Badge tone="neutral" icon="lock">Off</Badge>
            )}
          </div>

          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Chore Quest has never chosen these for you. Until both are set, the kids&apos; wallets
            show cash out as turned off.
          </p>

          <div className="grid-2">
            <label className="field">
              <span className="field__label">Points per dollar</span>
              <input
                className="input numeric"
                type="number"
                min={1}
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                placeholder="Not set"
              />
            </label>
            <label className="field">
              <span className="field__label">Minimum to cash out</span>
              <input
                className="input numeric"
                type="number"
                min={0}
                value={minimum}
                onChange={(event) => setMinimum(event.target.value)}
                placeholder="Not set"
              />
            </label>
          </div>

          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <Icon name="lock" size={18} />
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              The ${(settings.weeklyCashOutCapCents / 100).toFixed(0)} weekly cap is fixed and
              cannot be changed here.
            </span>
          </div>

          <div className="row" style={{ gap: 'var(--space-3)' }}>
            {settings.cashOutConfigured && (
              <Button tone="stop" block disabled={working} onClick={() => void saveCashOut(true)}>
                Turn off
              </Button>
            )}
            <Button tone="go" block disabled={working || !cashOutReady} onClick={() => void saveCashOut()}>
              {settings.cashOutConfigured ? 'Update' : 'Turn cash out on'}
            </Button>
          </div>
        </section>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <InstallPrompt />
        </div>

        <section className="card stack" style={{ marginTop: 'var(--space-4)' }}>
          <h2 className="subtitle">Household</h2>
          <div className="row row--between">
            <span>Time zone</span>
            <strong>{settings.timezone}</strong>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Every chore day, deadline, and streak is worked out in this zone. Changing it means
            changing HOUSEHOLD_TZ on the laptop and restarting.
          </p>
        </section>
      </main>
    </>
  );
}
