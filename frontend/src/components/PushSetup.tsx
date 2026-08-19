import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../design/icons';
import { Badge, Button } from '../design/primitives';
import { disablePush, enablePush, readPushState, type PushState } from '../lib/push';

/**
 * "Reminders on this phone" - the switch, and the honest reason when there is
 * no switch to offer.
 *
 * Per device rather than per person, because that is what a subscription
 * actually is. A child with the app on a phone and a tablet answers this twice,
 * and turning it off on the tablet leaves the phone alone. Anything else would
 * be a lie about what the browser is doing.
 */

interface Copy {
  badge: { tone: 'done' | 'waiting' | 'late' | 'neutral'; text: string };
  detail: string;
  action: 'enable' | 'disable' | null;
}

const COPY: Record<PushState, Copy> = {
  on: {
    badge: { tone: 'done', text: 'On' },
    detail: 'This phone buzzes when a chore is still unfinished in the evening.',
    action: 'disable',
  },
  off: {
    badge: { tone: 'neutral', text: 'Off' },
    detail:
      'Turn this on and the evening reminder arrives without the app being open. Nothing else buzzes.',
    action: 'enable',
  },
  blocked: {
    badge: { tone: 'late', text: 'Blocked' },
    // The browser will not ask twice, so there is no button that could help.
    detail:
      'Notifications are switched off for this site in the browser itself, so the app cannot ask again. ' +
      'Allow them in the browser’s site settings, then come back here.',
    action: null,
  },
  unconfigured: {
    badge: { tone: 'waiting', text: 'Not set up' },
    detail:
      'The laptop has no push keys yet. On the laptop run npm run vapid, put the three lines in ' +
      'backend/.env, and restart. Reminders still arrive in the inbox in the meantime.',
    action: null,
  },
  insecure: {
    badge: { tone: 'waiting', text: 'Needs https' },
    detail:
      'Browsers only allow notifications over https or on the laptop itself, the same rule as the camera. ' +
      'Opening the app by the laptop’s wifi address will not do it.',
    action: null,
  },
  unsupported: {
    badge: { tone: 'waiting', text: 'Not available' },
    detail:
      'This browser cannot do notifications. On an iPhone that usually means the app has to be added ' +
      'to the home screen and opened from there first.',
    action: null,
  },
};

export function PushSetup({ heading = 'Reminders on this phone' }: { heading?: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await readPushState());
    } catch {
      setState('unsupported');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: 'enable' | 'disable') => {
    setWorking(true);
    setError(null);
    try {
      setState(action === 'enable' ? await enablePush() : await disablePush());
    } catch {
      setError('That did not work. Try again in a moment.');
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  // Nothing at all until the state is known: a switch that flickers from Off to
  // On as the page settles reads as the app changing it by itself.
  if (state === null) return null;

  const copy = COPY[state];

  return (
    <section className="card stack stack--tight">
      <div className="row row--between">
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <Icon name="bell" size={18} />
          <strong>{heading}</strong>
        </span>
        <Badge tone={copy.badge.tone}>{copy.badge.text}</Badge>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
        {copy.detail}
      </p>

      {error && (
        <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-2)' }}>
          {error}
        </p>
      )}

      {copy.action === 'enable' && (
        <Button tone="go" block disabled={working} onClick={() => void run('enable')}>
          Turn on reminders
        </Button>
      )}
      {copy.action === 'disable' && (
        <Button tone="quiet" block disabled={working} onClick={() => void run('disable')}>
          Turn off on this phone
        </Button>
      )}
    </section>
  );
}
