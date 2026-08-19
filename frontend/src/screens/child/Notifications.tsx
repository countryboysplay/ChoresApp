import { Icon } from '../../design/icons';
import { Badge, Button } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { relativeTime } from '../../config/format';
import { childNotices } from '../../mock/data';
import { EmptyState } from '../../design/primitives';

export function Notifications() {
  const unread = childNotices.filter((notice) => notice.unread).length;

  return (
    <>
      <ScreenTop
        title="Notifications"
        trailing={unread ? <Badge tone="info">{unread} new</Badge> : undefined}
      />
      <main className="screen">
        {childNotices.length === 0 ? (
          <EmptyState
            icon="bell"
            title="Nothing yet"
            message="Approvals, new bonus chores, and reward updates show up here."
          />
        ) : (
          <div className="stack stack--tight">
            {childNotices.map((notice) => (
              <article
                key={notice.id}
                className={`card card--status is-${notice.tone === 'done' ? 'done' : notice.tone === 'late' ? 'late' : notice.tone === 'waiting' ? 'waiting' : 'info'} row`}
              >
                <span
                  className={`tile-icon tile-icon--sm ${notice.tone === 'done' ? 'tile-icon--green' : notice.tone === 'late' ? 'tile-icon--red' : 'tile-icon--blue'}`}
                >
                  <Icon
                    name={notice.tone === 'done' ? 'check' : notice.tone === 'late' ? 'alert' : 'bell'}
                    size={20}
                  />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="row row--between">
                    <strong>{notice.title}</strong>
                    {notice.unread ? <Badge tone="info">New</Badge> : null}
                  </div>
                  <p style={{ margin: '2px 0 0' }}>{notice.body}</p>
                  <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                    {relativeTime(notice.minutesAgo)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}

        <Button tone="purple" block style={{ marginTop: 'var(--space-4)' }}>
          Mark all read
        </Button>
      </main>
    </>
  );
}
