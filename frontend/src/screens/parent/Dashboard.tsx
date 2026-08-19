import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../../design/Avatar';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, Meter, PointsPill, Sheet, StatRow } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { relativeTime } from '../../config/format';
import {
  children,
  coreChores,
  needsAttention,
  pendingSubmissions,
  weekActivity,
  type AttentionItem,
} from '../../mock/data';
import { StatusBadge } from '../child/choreStatus';

const KIND_ICON: Record<AttentionItem['kind'], IconName> = {
  approval: 'camera',
  missed: 'alert',
  cash_out: 'coin',
  reward: 'gift',
};

export function ParentDashboard() {
  const navigate = useNavigate();
  const [quickCreate, setQuickCreate] = useState(false);
  const [quickAction, setQuickAction] = useState<AttentionItem | null>(null);

  const weekPoints = children.reduce((total, child) => total + child.weekPoints, 0);
  const choresDone = Object.values(weekActivity)
    .flat()
    .reduce((total, day) => total + day.approved, 0);
  const bonusExpiring = 2;

  return (
    <>
      <ScreenTop
        title="Welcome back"
        trailing={
          <Button size="sm" tone="primary" icon="plus" onClick={() => setQuickCreate(true)}>
            Create
          </Button>
        }
      />
      <main className="screen screen--wide">
        {/* Household summary */}
        <div className="stack stack--tight">
          <StatRow icon="trophy" tone="gold" label="Total points this week" value={weekPoints.toLocaleString('en-US')} />
          <StatRow icon="check" tone="green" label="Chores completed" value={`${choresDone} / 14`} />
          <StatRow
            icon="camera"
            tone="red"
            label="Pending approvals"
            value={String(pendingSubmissions.length)}
            onClick={() => navigate('/parent/approvals')}
          />
          <StatRow
            icon="star"
            tone="purple"
            label="Bonus expiring"
            value={String(bonusExpiring)}
            onClick={() => navigate('/parent/bonus')}
          />
        </div>

        {/* Needs attention */}
        <section style={{ marginTop: 'var(--space-5)' }}>
          <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
            <h2 className="subtitle">Needs attention</h2>
            <Link to="/parent/approvals" className="btn btn--quiet btn--sm">
              View all
            </Link>
          </div>
          <div className="stack stack--tight">
            {needsAttention.slice(0, 3).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`card card--interactive card--status ${item.urgency === 'high' ? 'is-late' : item.urgency === 'medium' ? 'is-waiting' : 'is-info'} row`}
                onClick={() =>
                  item.kind === 'approval' ? navigate('/parent/approvals') : setQuickAction(item)
                }
              >
                <span
                  className={`tile-icon tile-icon--sm ${item.urgency === 'high' ? 'tile-icon--red' : item.urgency === 'medium' ? 'tile-icon--gold' : 'tile-icon--blue'}`}
                >
                  <Icon name={KIND_ICON[item.kind]} size={20} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block' }}>{item.title}</strong>
                  <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                    {item.child} · {item.detail} · {relativeTime(item.minutesAgo)}
                  </span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
        </section>

        {/* Per-child status */}
        <div className="grid-parent" style={{ marginTop: 'var(--space-5)' }}>
          {children.map((child) => {
            const chore = coreChores.find((entry) => entry.id === child.todayChoreId)!;
            const done = chore.subtasks.filter((task) => task.done).length;
            const week = weekActivity[child.id] ?? [];
            const maxPoints = Math.max(...week.map((day) => day.points), 1);

            return (
              <article key={child.id} className="card stack">
                <button
                  type="button"
                  className="row"
                  style={{ background: 'none', border: 'none', color: 'inherit', padding: 0, textAlign: 'left' }}
                  onClick={() => navigate('/parent/children')}
                >
                  <Avatar config={child.avatar} size={52} label={`${child.name} avatar`} />
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: 'block' }}>{child.name}</strong>
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {child.streakDays} day streak
                    </span>
                  </span>
                  <PointsPill value={child.spendablePoints} small />
                  <Icon name="chevron" size={18} />
                </button>

                <div className="card card--status is-info" style={{ background: 'var(--surface-sunken)' }}>
                  <div className="row row--between" style={{ marginBottom: 'var(--space-2)' }}>
                    <span className="row" style={{ gap: 'var(--space-2)' }}>
                      <Icon name={chore.icon} size={18} />
                      <strong>{chore.name}</strong>
                    </span>
                    <StatusBadge status={chore.status} />
                  </div>
                  <Meter value={done} max={chore.subtasks.length} right={`${done}/${chore.subtasks.length} subtasks`} />
                  <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <Badge tone={chore.status === 'submitted' ? 'done' : 'neutral'} icon="camera">
                      {chore.status === 'submitted' ? 'Photo submitted' : 'No photo yet'}
                    </Badge>
                    <PointsPill value={`${chore.points} if approved`} small />
                  </div>
                </div>

                <div>
                  <span className="eyebrow" style={{ color: 'var(--text-muted)' }}>
                    Last 7 days
                  </span>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, 1fr)',
                      gap: 6,
                      alignItems: 'end',
                      height: 84,
                      marginTop: 'var(--space-2)',
                    }}
                  >
                    {week.map((day) => (
                      <div key={day.day} style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
                        <div
                          title={`${day.points} points`}
                          style={{
                            width: '100%',
                            height: `${Math.max(6, (day.points / maxPoints) * 56)}px`,
                            borderRadius: 6,
                            background:
                              day.missed > 0
                                ? 'linear-gradient(180deg, #ff7b7b, var(--red))'
                                : day.approved > 0
                                  ? 'linear-gradient(180deg, #22dd7f, var(--green))'
                                  : 'rgba(255,255,255,0.12)',
                          }}
                        />
                        <span className="muted" style={{ fontSize: 10 }}>
                          {day.day}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {quickCreate && (
        <Sheet title="Quick create" onClose={() => setQuickCreate(false)}>
          <div className="stack stack--tight">
            {(
              [
                ['Bonus chore', 'star', '/parent/bonus', 'purple'],
                ['Recurring chore', 'missions', '/parent/chores/new', 'blue'],
                ['One-day schedule override', 'calendar', '/parent/schedule', 'blue'],
                ['Pause or vacation', 'lock', '/parent/schedule', 'slate'],
                ['Reward', 'gift', '/parent/rewards', 'gold'],
              ] as [string, IconName, string, 'blue' | 'purple' | 'gold' | 'slate'][]
            ).map(([label, icon, to, tone]) => (
              <button
                key={label}
                type="button"
                className="card card--interactive row"
                onClick={() => {
                  setQuickCreate(false);
                  navigate(to);
                }}
              >
                <span className={`tile-icon tile-icon--sm tile-icon--${tone}`}>
                  <Icon name={icon} size={20} />
                </span>
                <span style={{ flex: 1, fontWeight: 700 }}>{label}</span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {quickAction && (
        <Sheet title={quickAction.title} onClose={() => setQuickAction(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            {quickAction.child} · {quickAction.detail}
          </p>
          <div className="stack stack--tight">
            {quickAction.kind === 'missed' && (
              <>
                <Button tone="quiet" block>Excuse this day</Button>
                <Button tone="quiet" block>Carry over to today</Button>
                <Button tone="stop" block>Mark missed</Button>
              </>
            )}
            {quickAction.kind === 'reward' && (
              <>
                <Button tone="go" block sound="approve">Approve reward</Button>
                <Button tone="stop" block>Reject and release points</Button>
              </>
            )}
            {quickAction.kind === 'cash_out' && (
              <>
                <p style={{ marginTop: 0 }}>
                  Set the points-to-dollars rate in Settings before approving allowance.
                </p>
                <Button tone="primary" block onClick={() => navigate('/parent/settings')}>
                  Open points and allowance
                </Button>
              </>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
