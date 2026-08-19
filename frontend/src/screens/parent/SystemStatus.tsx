import { Icon } from '../../design/icons';
import { Badge, Button } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { settings } from '../../mock/data';

const ROWS: { label: string; value: string; tone: 'done' | 'waiting' | 'late' | 'neutral' }[] = [
  { label: 'Backend', value: 'Online', tone: 'done' },
  { label: 'Last contact with server', value: '30 seconds ago', tone: 'done' },
  { label: 'Database', value: 'Not configured yet', tone: 'waiting' },
  { label: 'Push notifications', value: 'Not set up yet', tone: 'waiting' },
  { label: 'Last successful backup', value: 'No backup yet', tone: 'waiting' },
  { label: 'App version', value: '0.1.0 (Stage 2 preview)', tone: 'neutral' },
  { label: 'Household timezone', value: settings.timezone, tone: 'neutral' },
];

export function SystemStatus() {
  return (
    <>
      <ScreenTop title="System status" back="/parent/settings" />
      <main className="screen">
        <div className="stack stack--tight">
          {ROWS.map((row) => (
            <div key={row.label} className="card row">
              <span style={{ flex: 1 }}>{row.label}</span>
              <Badge tone={row.tone} icon={row.tone === 'done' ? 'check' : row.tone === 'waiting' ? 'clock' : undefined}>
                {row.value}
              </Badge>
            </div>
          ))}
        </div>

        <div className="stack stack--tight" style={{ marginTop: 'var(--space-5)' }}>
          <Button tone="quiet" block icon="lock">
            Back up now
          </Button>
          <Button tone="quiet" block icon="alert">
            Restore from backup
          </Button>
          <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
            <Icon name="alert" size={14} /> Restoring replaces current data and always asks for
            confirmation first.
          </p>
        </div>
      </main>
    </>
  );
}
