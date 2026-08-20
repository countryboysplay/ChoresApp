import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../design/icons';
import { Badge, Button } from '../design/primitives';
import { enablePush, readPushState, type PushState } from '../lib/push';

/**
 * Reminders on a child's phone. There is no off switch here, on purpose.
 *
 * Owner decision: reminders are not optional for a child. The app cannot
 * actually enforce that - notification permission belongs to whoever is holding
 * the phone, Chrome will not let a site grant itself permission, and its
 * settings can always take it back - so this does the only two things it can. It
 * never offers a way out of its own, and it turns itself on without being asked.
 * The third part of the rule lives on the parent side: a child who finds the
 * browser's off switch shows up on the parent's screen rather than going quiet.
 *
 * Every state a phone can be in is named rather than collapsed into a boolean,
 * because they need completely different sentences. "Your browser cannot do
 * this", "this address is not https", "the laptop has no keys yet", and "you
 * said no once" are four different problems with four different fixes.
 */

interface Copy {
  badge: { tone: 'done' | 'waiting' | 'late' | 'neutral'; text: string };
  detail: string;
  /** Only ever a retry. Nothing here turns reminders off. */
  retry: boolean;
}

const COPY: Record<PushState, Copy> = {
  on: {
    badge: { tone: 'done', text: 'On' },
    detail: 'This phone buzzes when a chore is still unfinished in the evening.',
    retry: false,
  },
  off: {
    badge: { tone: 'waiting', text: 'Off' },
    // Reached when the browser prompt was dismissed rather than refused. Chrome
    // will ask again, so a retry button is worth offering.
    detail: 'Reminders are meant to be on. Tap to let this phone buzz when a chore is unfinished.',
    retry: true,
  },
  blocked: {
    badge: { tone: 'late', text: 'Blocked' },
    // The browser will not ask twice, so there is no button that could help.
    detail:
      'Notifications are switched off for this site in the browser, so the app cannot ask again. ' +
      'Allow them in the browser’s site settings to turn reminders back on. Until then your ' +
      'grown-up can see that reminders are not reaching this phone.',
    retry: false,
  },
  unconfigured: {
    badge: { tone: 'waiting', text: 'Not set up' },
    detail:
      'The laptop has no push keys yet, so nothing can be sent. Reminders still arrive here in ' +
      'the inbox in the meantime.',
    retry: false,
  },
  insecure: {
    badge: { tone: 'waiting', text: 'Needs https' },
    detail:
      'Browsers only allow notifications over https or on the laptop itself, the same rule as the ' +
      'camera. Opening the app by the laptop’s wifi address will not do it.',
    retry: false,
  },
  unsupported: {
    badge: { tone: 'waiting', text: 'Not available' },
    detail:
      'This browser cannot do notifications. On an iPhone that usually means the app has to be ' +
      'added to the home screen and opened from there first.',
    retry: false,
  },
};

export function PushSetup({ heading = 'Reminders on this phone' }: { heading?: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** One unprompted attempt per mount. Asking in a loop is how a browser
   *  decides to stop asking at all. */
  const attempted = useRef(false);

  const refresh = useCallback(async () => {
    try {
      return await readPushState();
    } catch {
      return 'unsupported' as PushState;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const current = await refresh();
      if (cancelled) return;

      // Turn it on without being asked. Chrome may show its quieter prompt for
      // a request that did not follow a tap, which is why signing in also tries
      // this from inside the tap that submitted the PIN - between them, most
      // phones never see this panel in its "off" state at all.
      if (current === 'off' && !attempted.current) {
        attempted.current = true;
        setWorking(true);
        try {
          const next = await enablePush();
          if (!cancelled) setState(next);
        } catch {
          if (!cancelled) setState(current);
        } finally {
          if (!cancelled) setWorking(false);
        }
        return;
      }

      setState(current);
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const retry = async () => {
    setWorking(true);
    setError(null);
    try {
      setState(await enablePush());
    } catch {
      setError('That did not work. Try again in a moment.');
      setState(await refresh());
    } finally {
      setWorking(false);
    }
  };

  // Nothing at all until the state is known: a panel that flickers from Off to
  // On as the page settles reads as the app changing it by itself.
  if (state === null) return null;

  const copy = COPY[state];
  const alarming = state === 'blocked' || state === 'off';

  return (
    <section
      className="card stack stack--tight"
      style={alarming ? { borderColor: 'var(--red)', borderWidth: 2, borderStyle: 'solid' } : undefined}
    >
      <div className="row row--between">
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <Icon name="bell" size={18} />
          <strong>{heading}</strong>
        </span>
        <Badge tone={copy.badge.tone}>{copy.badge.text}</Badge>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
        {working ? 'Turning reminders on…' : copy.detail}
      </p>

      {error && (
        <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-2)' }}>
          {error}
        </p>
      )}

      {copy.retry && (
        <Button tone="go" block disabled={working} onClick={() => void retry()}>
          Turn on reminders
        </Button>
      )}
    </section>
  );
}
