import { useCallback, useEffect, useState } from 'react';
import type { ChildReminderState } from '@chore-quest/shared';
import { Icon } from '../design/icons';
import { Badge, Button } from '../design/primitives';
import { api, ApiRequestError } from '../lib/api';

/**
 * Whose phone is actually being reached, and the one switch that turns it off.
 *
 * This screen exists because the app cannot enforce the rule a parent would
 * like. Notification permission belongs to whoever is holding the phone: Chrome
 * will not let a site grant itself permission, and Chrome's own settings can
 * always take it back. A child app that pretended otherwise would just move the
 * off switch somewhere a parent never looks.
 *
 * So the rule is enforced the only way it can be - by being visible. The child
 * app offers no way out, turns itself on unprompted, and anything a child does
 * in the browser instead shows up here as "not reaching".
 */

function describe(child: ChildReminderState): { tone: 'done' | 'waiting' | 'late'; text: string } {
  if (child.mutedByParent) return { tone: 'waiting', text: 'Muted by you' };
  if (child.devices === 0) return { tone: 'late', text: 'Not reaching' };
  return {
    tone: 'done',
    text: child.devices === 1 ? 'On, 1 phone' : `On, ${child.devices} phones`,
  };
}

export function ChildReminders() {
  const [children, setChildren] = useState<ChildReminderState[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.push.children();
      setChildren(response.children);
      setConfigured(response.configured);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'Could not load reminder settings.',
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (child: ChildReminderState) => {
    setBusy(child.id);
    try {
      await api.push.setMuted(child.id, !child.mutedByParent);
      await load();
    } catch {
      setError('That did not save.');
    } finally {
      setBusy(null);
    }
  };

  if (children === null) return null;

  const unreachable = children.filter((child) => !child.remindersReaching && !child.mutedByParent);

  return (
    <section className="card stack stack--tight">
      <div className="row row--between">
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <Icon name="bell" size={18} />
          <strong>Phone reminders</strong>
        </span>
        {unreachable.length > 0 && <Badge tone="late">{unreachable.length} not reaching</Badge>}
      </div>

      {!configured && (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          The laptop has no push keys yet, so nothing reaches a phone at all. Run{' '}
          <code>npm run vapid</code> on the laptop and restart the server.
        </p>
      )}

      {error && (
        <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-2)' }}>
          {error}
        </p>
      )}

      {children.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          No children yet.
        </p>
      ) : (
        children.map((child) => {
          const status = describe(child);
          return (
            <div key={child.id} className="row row--between" style={{ gap: 'var(--space-3)' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{child.displayName}</strong>
                <Badge tone={status.tone}>{status.text}</Badge>
              </span>
              <Button
                tone={child.mutedByParent ? 'go' : 'quiet'}
                size="sm"
                disabled={busy === child.id}
                onClick={() => void toggle(child)}
              >
                {child.mutedByParent ? 'Unmute' : 'Mute'}
              </Button>
            </div>
          );
        })
      )}

      {unreachable.length > 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          <Icon name="alert" size={14} /> "Not reaching" means no phone is signed up. Either they
          have not opened the app on a phone yet, or notifications were switched off for the site in
          that phone's browser. The app cannot stop that being done — it can only tell you.
        </p>
      )}

      <p className="muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
        Muting stops the phone buzzing. It does not stop the reminder — that still arrives in the
        child's inbox either way.
      </p>
    </section>
  );
}
