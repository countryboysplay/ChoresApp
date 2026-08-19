import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { InboxNotification } from '@chore-quest/shared';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, EmptyState } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { relativeTime } from '../../config/format';
import { api, ApiRequestError } from '../../lib/api';

const ICON_FOR: Record<InboxNotification['tone'], IconName> = {
  done: 'check',
  waiting: 'clock',
  late: 'alert',
  info: 'inbox',
};

const COLOR_FOR: Record<InboxNotification['tone'], string> = {
  done: 'var(--green)',
  waiting: 'var(--gold)',
  late: 'var(--red)',
  info: 'var(--blue)',
};

export function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.notifications.list();
      setItems(response.notifications);
      setUnread(response.unread);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not load your inbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (item: InboxNotification) => {
    if (!item.read) {
      // Optimistic: the badge should clear the moment it is tapped, and a
      // failed mark-read is not worth blocking navigation over.
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)));
      setUnread((count) => Math.max(0, count - 1));
      void api.notifications.markRead(item.id).catch(() => undefined);
    }
    if (item.deepLink?.startsWith('#/')) navigate(item.deepLink.slice(1));
  };

  const markAll = async () => {
    try {
      await api.notifications.markAllRead();
      await load();
    } catch {
      setError('That did not save.');
    }
  };

  return (
    <>
      <ScreenTop title="Inbox" />
      <main className="screen">
        {error && (
          <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        {loading ? (
          <p aria-live="polite" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
            Loading&hellip;
          </p>
        ) : items.length === 0 ? (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <EmptyState
              icon="inbox"
              title="Nothing here yet"
              message="Approvals, reminders, and reward answers show up in this inbox."
            />
          </div>
        ) : (
          <>
            {unread > 0 && (
              <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
                <Badge tone="info">{unread} unread</Badge>
                <Button tone="quiet" size="sm" onClick={() => void markAll()}>
                  Mark all read
                </Button>
              </div>
            )}

            <div className="stack stack--tight">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="card card--interactive row"
                  style={{
                    gap: 'var(--space-3)',
                    textAlign: 'left',
                    opacity: item.read ? 0.7 : 1,
                  }}
                  onClick={() => void open(item)}
                >
                  <Icon
                    name={ICON_FOR[item.tone]}
                    size={22}
                    style={{ color: COLOR_FOR[item.tone] }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: item.read ? 600 : 800, display: 'block' }}>
                      {item.title}
                    </span>
                    {item.body && (
                      <span className="muted" style={{ fontSize: 'var(--text-sm)', display: 'block' }}>
                        {item.body}
                      </span>
                    )}
                    <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                      {relativeTime(minutesSince(item.at))}
                    </span>
                  </span>
                  {!item.read && (
                    <span
                      aria-label="Unread"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--blue)',
                        flexShrink: 0,
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}
