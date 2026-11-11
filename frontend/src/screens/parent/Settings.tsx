import { useCallback, useEffect, useState } from 'react';
import type { HouseholdSettings } from '@chore-quest/shared';
import { Icon } from '../../design/icons';
import { Badge, Button } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { InstallPrompt } from '../../components/InstallPrompt';
import { useSwitchUser } from '../../components/ParentShell';
import { api, ApiRequestError } from '../../lib/api';

/**
 * Household settings.
 *
 * The points-to-dollars rate and the minimum cash-out balance are the two values
 * the app has always refused to invent. They are set here, together, and setting
 * them is what turns the wallet's cash-out panel on.
 */
export function Settings() {
  const switchUser = useSwitchUser();
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
  const [goal, setGoal] = useState('');
  const [goalReward, setGoalReward] = useState('');

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
      setGoal(loaded.weeklyXpGoal === null ? '' : String(loaded.weeklyXpGoal));
      setGoalReward(loaded.weeklyGoalReward ?? '');
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

  const saveGoal = async (clear = false) => {
    setWorking(true);
    setError(null);
    try {
      await api.household.saveSettings(
        clear
          ? { weeklyXpGoal: null, weeklyGoalReward: null }
          : { weeklyXpGoal: Number(goal), weeklyGoalReward: goalReward.trim() || null },
      );
      setNotice(clear ? 'Family goal removed.' : 'Family goal saved.');
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
          <h2 className="subtitle row" style={{ gap: 'var(--space-2)' }}>
            <Icon name="xp" size={20} />
            Points
          </h2>
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
            Points per core chore is what a new chore starts at; each one can still be given its
            own value, and changing this never rewrites a chore already made. The reminder time is
            also the punctuality deadline: a chore sent in before it earns the bonus.
          </p>

          <Button tone="go" block icon="check" disabled={working} onClick={() => void savePoints()}>
            {working ? 'Saving…' : 'Save points'}
          </Button>
        </section>

        <section className="card stack" style={{ marginTop: 'var(--space-4)' }}>
          <div className="row row--between">
            <h2 className="subtitle row" style={{ margin: 0, gap: 'var(--space-2)' }}>
              <Icon name="cash" size={20} />
              Allowance
            </h2>
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
            <Icon name="shield" size={18} />
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              The ${(settings.weeklyCashOutCapCents / 100).toFixed(0)} weekly cap is fixed and
              cannot be changed here.
            </span>
          </div>

          <div className="row" style={{ gap: 'var(--space-3)' }}>
            {settings.cashOutConfigured && (
              <Button tone="stop" block icon="minus" disabled={working} onClick={() => void saveCashOut(true)}>
                Turn off
              </Button>
            )}
            <Button tone="go" block icon="cash-out" disabled={working || !cashOutReady} onClick={() => void saveCashOut()}>
              {settings.cashOutConfigured ? 'Update' : 'Turn cash out on'}
            </Button>
          </div>
        </section>

        <section className="card stack" style={{ marginTop: 'var(--space-4)' }}>
          <div className="row row--between">
            <h2 className="subtitle row" style={{ margin: 0, gap: 'var(--space-2)' }}>
              <Icon name="leaderboard" size={20} />
              Family goal
            </h2>
            {settings.weeklyXpGoal !== null ? (
              <Badge tone="done" icon="check">On</Badge>
            ) : (
              <Badge tone="neutral" icon="minus">None</Badge>
            )}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            A weekly XP target the kids work toward together, Monday to Sunday. Their home screen
            shows the shared progress bar, and everyone who chipped in earns the Team Player badge
            when it is reached. It changes no points or money.
          </p>
          <div className="grid-2">
            <label className="field">
              <span className="field__label">Weekly XP target</span>
              <input
                className="input numeric"
                type="number"
                min={1}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="No goal"
              />
            </label>
            <label className="field">
              <span className="field__label">Reward (optional)</span>
              <input
                className="input"
                type="text"
                maxLength={60}
                value={goalReward}
                onChange={(event) => setGoalReward(event.target.value)}
                placeholder="Pizza night"
              />
            </label>
          </div>
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            {settings.weeklyXpGoal !== null && (
              <Button tone="stop" block icon="minus" disabled={working} onClick={() => void saveGoal(true)}>
                Remove goal
              </Button>
            )}
            <Button
              tone="go"
              block
              icon="check"
              disabled={working || !(Number.isInteger(Number(goal)) && Number(goal) > 0)}
              onClick={() => void saveGoal()}
            >
              Save goal
            </Button>
          </div>
        </section>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <InstallPrompt />
        </div>

        <section className="card stack" style={{ marginTop: 'var(--space-4)' }}>
          <h2 className="subtitle row" style={{ gap: 'var(--space-2)' }}>
            <Icon name="home" size={20} />
            Household
          </h2>
          <div className="row row--between">
            <span>Time zone</span>
            <strong>{settings.timezone}</strong>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Every chore day, deadline, and streak is worked out in this zone. Changing it means
            changing HOUSEHOLD_TZ on the laptop and restarting.
          </p>
        </section>

        <section className="card stack" style={{ marginTop: 'var(--space-4)' }}>
          <h2 className="subtitle row" style={{ gap: 'var(--space-2)' }}>
            <Icon name="profile" size={20} />
            This device
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Signs you out here and goes back to the profile picker, so someone else can sign in.
          </p>
          <Button tone="quiet" block icon="logout" onClick={() => void switchUser()}>
            Switch user
          </Button>
        </section>
      </main>
    </>
  );
}
