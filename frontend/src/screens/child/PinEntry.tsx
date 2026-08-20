import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AUTH_ERROR, type InvalidPinDetails, type PinLockedDetails } from '@chore-quest/shared';
import type { AvatarConfig } from '../../design/Avatar';
import { Avatar } from '../../design/Avatar';
import { Icon } from '../../design/icons';
import { useSkyBackground } from '../../hooks/useSkyBackground';
import { playSound } from '../../design/sound';
import { ApiRequestError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { enablePush } from '../../lib/push';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
const PIN_LENGTH = 4;

export function PinEntry() {
  useSkyBackground();
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const { mode, profiles, login } = useAuth();

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  const profile = profiles.find((entry) => entry.id === userId);
  const isParent = profile?.role === 'parent';
  const name = profile?.displayName ?? 'Player';

  const goHome = () => navigate(isParent ? '/parent' : '/child/home', { replace: true });

  const submit = async (candidate: string) => {
    // The Pages preview has no server to check against, so it walks through.
    // There is no household data behind these screens in that mode.
    if (mode === 'preview') {
      window.setTimeout(goHome, 220);
      return;
    }

    setBusy(true);
    try {
      const signedIn = await login(userId, candidate);
      playSound('success');
      // Reminders are not optional for a child, so this asks rather than
      // waiting to be asked. It runs here, in the chain the PIN tap started,
      // because Chrome treats a permission request that followed a tap more
      // generously than one that arrived on its own. Deliberately not awaited:
      // a browser prompt must never stand between a child and their chores, and
      // the panel on the inbox screen tries again if this comes to nothing.
      if (signedIn.role === 'child') void enablePush().catch(() => undefined);
      goHome();
    } catch (caught) {
      // No sound on failure. The design system has five effects and none of
      // them means "wrong"; a cheerful one here would read as success.
      setPin('');

      if (!(caught instanceof ApiRequestError)) {
        setError('Something went wrong. Try again.');
        return;
      }

      if (caught.code === AUTH_ERROR.pinLocked) {
        const details = caught.details as PinLockedDetails | undefined;
        setLocked(true);
        setError(caught.message);
        // Re-enable the pad the moment the wait is over, so nobody has to guess
        // when to try again or reload the page.
        if (details?.retryAfterSeconds) {
          window.setTimeout(() => {
            setLocked(false);
            setError(null);
          }, details.retryAfterSeconds * 1000);
        }
        return;
      }

      if (caught.code === AUTH_ERROR.invalidPin) {
        const details = caught.details as InvalidPinDetails | undefined;
        setError(
          details && details.attemptsRemaining > 0
            ? `That PIN is not right. ${details.attemptsRemaining} ${
                details.attemptsRemaining === 1 ? 'try' : 'tries'
              } left before a short wait.`
            : 'That PIN is not right.',
        );
        return;
      }

      setError(caught.isUnreachable ? 'Cannot reach the Chore Quest server.' : caught.message);
    } finally {
      setBusy(false);
    }
  };

  const press = (key: string) => {
    if (!key || busy || locked) return;
    playSound('tap');
    if (key === 'back') {
      setError(null);
      return setPin((value) => value.slice(0, -1));
    }
    if (pin.length >= PIN_LENGTH) return;

    const next = pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  return (
    <main className="screen screen--sky" style={{ paddingTop: 'var(--space-6)', maxWidth: 400 }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-3)' }}>
        {profile && profile.role === 'child' && profile.avatar ? (
          <Avatar config={profile.avatar as AvatarConfig} size={76} label={`${name} avatar`} />
        ) : (
          <span className="iconbtn" style={{ width: 76, height: 76 }}>
            <Icon name="user" size={32} />
          </span>
        )}
        <h1 className="title" style={{ fontSize: 'var(--text-xl)' }}>
          Enter your PIN
        </h1>

        <div className="row" style={{ gap: 'var(--space-4)', margin: 'var(--space-3) 0 var(--space-5)' }}>
          {Array.from({ length: PIN_LENGTH }).map((_, index) => (
            <span
              key={index}
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.85)',
                background: index < pin.length ? '#fff' : 'transparent',
                transition: 'background var(--transition-fast)',
              }}
            />
          ))}
        </div>
        <p className="visually-hidden" aria-live="polite">{`${pin.length} of ${PIN_LENGTH} digits entered`}</p>

        {error && (
          <p
            role="alert"
            className="badge badge--late"
            style={{ textAlign: 'center', maxWidth: 320, lineHeight: 1.4, padding: 'var(--space-3)' }}
          >
            {error}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
        {KEYS.map((key, index) =>
          key ? (
            <button
              key={key}
              type="button"
              className="btn btn--dark"
              style={{ minHeight: 62, fontSize: 'var(--text-xl)', borderRadius: 'var(--radius-md)' }}
              onClick={() => press(key)}
              disabled={busy || locked}
              aria-label={key === 'back' ? 'Delete last digit' : key}
            >
              {key === 'back' ? <Icon name="close" size={20} /> : key}
            </button>
          ) : (
            <span key={`gap-${index}`} />
          ),
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 'var(--space-5)' }}>
        <button
          type="button"
          className="btn btn--quiet btn--sm"
          style={{ borderColor: 'rgba(255,255,255,0.5)', color: '#fff' }}
          onClick={() => navigate('/profiles')}
        >
          Forgot PIN?
        </button>
      </div>
    </main>
  );
}
