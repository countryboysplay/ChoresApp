import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../design/icons';
import { api } from '../lib/api';

/**
 * The parent's way into the inbox from a phone.
 *
 * The bottom bar has five tabs and they are all things a parent does several
 * times a day; the inbox is not one of them, so it lives here on the dashboard
 * instead of displacing something. The count is the reason to tap it - a bell
 * that never says anything is a bell nobody presses.
 */
export function InboxBell({ to }: { to: string }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.notifications
      .list()
      .then((response) => {
        if (!cancelled) setUnread(response.unread);
      })
      // Silent. A dashboard that shows an error because a badge could not load
      // is reporting the wrong thing.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      to={to}
      className="iconbtn"
      aria-label={unread > 0 ? `Inbox, ${unread} unread` : 'Inbox'}
      style={{ position: 'relative' }}
    >
      <Icon name="bell" size={20} />
      {unread > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 999,
            background: 'var(--red)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 800,
            lineHeight: '16px',
            textAlign: 'center',
          }}
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
