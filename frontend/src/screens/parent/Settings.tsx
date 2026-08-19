import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../../design/icons';
import { Badge, Button, Sheet } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { settings } from '../../mock/data';

const SECTIONS: { id: string; label: string; icon: IconName; detail: string }[] = [
  { id: 'household', label: 'Household & users', icon: 'user', detail: 'Accounts, PINs, roles' },
  { id: 'chores', label: 'Chores', icon: 'missions', detail: 'Templates, schedule defaults' },
  { id: 'points', label: 'Points & allowance', icon: 'coin', detail: 'Needs setup' },
  { id: 'rewards', label: 'Rewards', icon: 'gift', detail: 'Store items, cooldowns' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', detail: `${settings.reminderTime} and ${settings.escalationTime}` },
  { id: 'devices', label: 'Devices', icon: 'home', detail: 'Trusted devices, push status' },
  { id: 'photos', label: 'Photos & storage', icon: 'camera', detail: '48-hour photo retention' },
  { id: 'backup', label: 'Backup', icon: 'lock', detail: 'Last backup, restore' },
  { id: 'system', label: 'App & system', icon: 'settings', detail: 'Version, connection' },
];

export function Settings() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <ScreenTop title="Settings" />
      <main className="screen screen--wide">
        <div className="stack stack--tight">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className="card card--interactive row"
              onClick={() => (section.id === 'system' ? navigate('/parent/system') : setOpen(section.id))}
            >
              <span className="tile-icon tile-icon--sm tile-icon--blue">
                <Icon name={section.icon} size={20} />
              </span>
              <span style={{ flex: 1 }}>
                <strong style={{ display: 'block' }}>{section.label}</strong>
                <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                  {section.detail}
                </span>
              </span>
              {section.id === 'points' ? <Badge tone="waiting" icon="alert">Setup</Badge> : null}
              <Icon name="chevron" size={18} />
            </button>
          ))}
        </div>
      </main>

      {open === 'points' && (
        <Sheet
          title="Points & allowance"
          onClose={() => setOpen(null)}
          footer={
            <Button tone="primary" block onClick={() => setOpen(null)}>
              Save settings
            </Button>
          }
        >
          <div className="stack">
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="field__label">Points per core chore</span>
                <input className="input numeric" type="number" defaultValue={settings.corePointValue} />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span className="field__label">Punctuality bonus</span>
                <input className="input numeric" type="number" defaultValue={settings.punctualityBonus} />
              </label>
            </div>
            <label className="field">
              <span className="field__label">Points per dollar</span>
              <input className="input numeric" type="number" placeholder="Not set" />
              <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                Cash-out stays off until this is set.
              </span>
            </label>
            <label className="field">
              <span className="field__label">Minimum balance to request allowance</span>
              <input className="input numeric" type="number" placeholder="Not set" />
            </label>
            <div className="card" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <strong>Fixed by the app</strong>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)' }}>
                ${settings.weeklyCashOutCapDollars} weekly cap per child, resetting Sunday at
                midnight. Cash-out amounts: {settings.cashOutPresets.map((value) => `$${value}`).join(', ')}.
              </p>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              Changes apply going forward. Points already earned are never recalculated.
            </p>
          </div>
        </Sheet>
      )}

      {open === 'notifications' && (
        <Sheet title="Notifications" onClose={() => setOpen(null)}>
          <div className="stack">
            <label className="field">
              <span className="field__label">Reminder to the kids</span>
              <input className="input" type="time" defaultValue="20:45" />
            </label>
            <label className="field">
              <span className="field__label">Escalation to parents</span>
              <input className="input" type="time" defaultValue="23:00" />
            </label>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              Kids cannot change these times.
            </p>
          </div>
        </Sheet>
      )}

      {open === 'photos' && (
        <Sheet title="Photos & storage" onClose={() => setOpen(null)}>
          <div className="stack stack--tight">
            <div className="card row">
              <Icon name="camera" size={20} />
              <span style={{ flex: 1 }}>Chore photos are deleted after</span>
              <strong>48 hours</strong>
            </div>
            <div className="card row">
              <Icon name="clock" size={20} />
              <span style={{ flex: 1 }}>Review records kept for</span>
              <strong>30 days</strong>
            </div>
          </div>
        </Sheet>
      )}

      {open && !['points', 'notifications', 'photos'].includes(open) && (
        <Sheet title={SECTIONS.find((section) => section.id === open)?.label ?? ''} onClose={() => setOpen(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            This section gets its real controls in a later stage. The layout and grouping are what
            need approval now.
          </p>
        </Sheet>
      )}
    </>
  );
}
