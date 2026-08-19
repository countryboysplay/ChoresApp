import { useState } from 'react';
import { Avatar } from '../../design/Avatar';

import { Badge, Button, PointsPill, Tile } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { relativeTime } from '../../config/format';
import { children, ledger, weekActivity } from '../../mock/data';

const TABS = ['Chores', 'Points', 'Rewards', 'History', 'Account'] as const;

export function ChildManage() {
  const [selected, setSelected] = useState(children[0]!.id);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Chores');
  const child = children.find((entry) => entry.id === selected)!;
  const week = weekActivity[child.id] ?? [];

  return (
    <>
      <ScreenTop title="Kids" />
      <main className="screen screen--wide">
        <div className="chip-row">
          {children.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="chip"
              aria-pressed={selected === entry.id}
              onClick={() => setSelected(entry.id)}
            >
              {entry.name}
            </button>
          ))}
        </div>

        <section className="panel panel--navy row" style={{ marginTop: 'var(--space-4)', gap: 'var(--space-4)' }}>
          <Avatar config={child.avatar} size={64} label={`${child.name} avatar`} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 'var(--text-lg)' }}>{child.name}</strong>
            <div className="row" style={{ gap: 'var(--space-2)', marginTop: 4 }}>
              <PointsPill value={child.spendablePoints} small />
              <Badge tone="soon" icon="flame">
                {child.streakDays} days
              </Badge>
            </div>
          </div>
        </section>

        <div className="tabs" style={{ marginTop: 'var(--space-4)' }} role="tablist">
          {TABS.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              className="tabs__tab"
              aria-selected={tab === entry}
              onClick={() => setTab(entry)}
            >
              {entry}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 'var(--space-4)' }}>
          {tab === 'Chores' && (
            <div className="stack stack--tight">
              {week.map((day) => (
                <div key={day.day} className="card row">
                  <strong style={{ width: 48 }}>{day.day}</strong>
                  <span style={{ flex: 1 }} className="muted">
                    {day.approved} approved · {day.missed} missed
                  </span>
                  <Badge tone={day.missed ? 'late' : day.approved ? 'done' : 'neutral'}>
                    {day.points} pts
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {tab === 'Points' && (
            <div className="grid-2">
              <Tile value={child.spendablePoints} label="Spendable" />
              <Tile value={child.lifetimePoints} label="Lifetime" />
              <Tile value={child.weekPoints} label="This week" />
              <Tile value={child.approvedChores} label="Chores approved" />
            </div>
          )}

          {tab === 'Rewards' && (
            <div className="card stack stack--tight">
              <strong>Nothing pending</strong>
              <p className="muted" style={{ margin: 0 }}>
                Reward requests appear on the dashboard under Needs attention.
              </p>
            </div>
          )}

          {tab === 'History' && (
            <div className="stack stack--tight">
              {ledger.map((entry) => (
                <div key={entry.id} className="card row">
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: 'block' }}>{entry.label}</strong>
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {relativeTime(entry.minutesAgo)}
                    </span>
                  </span>
                  <strong className="numeric">
                    {entry.delta > 0 ? '+' : ''}
                    {entry.delta}
                  </strong>
                </div>
              ))}
            </div>
          )}

          {tab === 'Account' && (
            <div className="stack stack--tight">
              <Button tone="quiet" block icon="lock">
                Reset PIN
              </Button>
              <Button tone="quiet" block icon="user">
                Manage trusted devices
              </Button>
              <Button tone="quiet" block icon="bell">
                Test push notification
              </Button>
              <Button tone="stop" block icon="close">
                Deactivate account
              </Button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
