import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../design/icons';
import { api } from '../lib/api';

/**
 * Says nothing at all when every child's phone is being reached.
 *
 * The point of the whole arrangement is that a child cannot quietly switch
 * reminders off, and quiet is exactly what happens if a parent has to go
 * looking. So this sits on the screen a parent already opens, and only when
 * there is something to say. A child a parent muted deliberately is not
 * something to say.
 */
export function ReminderWarning() {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.push
      .children()
      .then((response) => {
        if (cancelled || !response.configured) return;
        setNames(
          response.children
            .filter((child) => !child.remindersReaching && !child.mutedByParent)
            .map((child) => child.displayName),
        );
      })
      // Silent. A dashboard that shows an error because a banner could not load
      // is reporting the wrong thing.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (names.length === 0) return null;

  const who =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  return (
    <Link
      to="/parent/notifications"
      className="card row"
      style={{
        gap: 'var(--space-3)',
        borderColor: 'var(--red)',
        borderWidth: 2,
        borderStyle: 'solid',
        marginBottom: 'var(--space-3)',
        textDecoration: 'none',
      }}
    >
      <Icon name="alert" size={20} style={{ color: 'var(--red)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block' }}>
          Evening reminders are not reaching {who}
        </strong>
        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          No phone is signed up, or notifications were switched off in that phone&rsquo;s browser.
        </span>
      </span>
      <Icon name="chevron" size={18} />
    </Link>
  );
}
