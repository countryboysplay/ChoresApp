import { useEffect, useState } from 'react';
import { Icon } from '../design/icons';
import { Button } from '../design/primitives';
import { useAuth } from '../lib/auth';

/**
 * What the app says when it cannot reach home.
 *
 * Owner decision: an honest screen rather than a cached copy of the day. A
 * child looking at yesterday's chore list cannot tell it is stale - a chore
 * approved ten minutes ago still shows as pending, ticks go nowhere, and the
 * one thing worse than an app that says it is offline is an app that quietly
 * lies about what has been done.
 *
 * So nothing here is data. The shell is cached so this screen appears instantly
 * with the app's own face on it rather than the browser's error page, and that
 * is the entire benefit being claimed.
 */
export function Offline() {
  const { refresh } = useAuth();
  const [retrying, setRetrying] = useState(false);

  // A phone that regains wifi should not need anybody to press anything. The
  // browser event only says the radio is back, not that the laptop is awake,
  // so it triggers a real request rather than assuming.
  useEffect(() => {
    const onBack = () => void refresh();
    window.addEventListener('online', onBack);
    return () => window.removeEventListener('online', onBack);
  }, [refresh]);

  const retry = async () => {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <main className="screen" style={{ textAlign: 'center', paddingTop: 'var(--space-7)' }}>
      <Icon name="alert" size={56} style={{ color: 'var(--gold)' }} />

      <h1 className="title" style={{ marginTop: 'var(--space-4)' }}>
        Can&rsquo;t reach home
      </h1>

      <p className="muted" style={{ maxWidth: '32ch', margin: 'var(--space-3) auto 0' }}>
        Chore Quest lives on the computer at home. It looks like that computer is asleep, or this
        device is off the wifi.
      </p>

      <p className="muted" style={{ maxWidth: '32ch', margin: 'var(--space-3) auto 0', fontSize: 'var(--text-sm)' }}>
        Nothing is lost. Chores, points, and photos are all safe at home, and everything will be
        here when the connection is back.
      </p>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <Button tone="primary" disabled={retrying} onClick={() => void retry()}>
          {retrying ? 'Trying…' : 'Try again'}
        </Button>
      </div>
    </main>
  );
}
