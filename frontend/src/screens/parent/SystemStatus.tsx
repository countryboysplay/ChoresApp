import { useEffect, useState } from 'react';
import type { PushStatusResponse } from '@chore-quest/shared';
import { Icon } from '../../design/icons';
import { Badge, Button } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api } from '../../lib/api';
import { settings } from '../../mock/data';

type Tone = 'done' | 'waiting' | 'late' | 'neutral';

/**
 * The only real row here is push. Backups are Stage 15 and the version and
 * uptime lines belong with the Stage 17 production build, so those stay on the
 * mock values they have carried since Stage 2 rather than being half-wired now.
 */
function pushRow(status: PushStatusResponse | null): { value: string; tone: Tone } {
  if (!status) return { value: 'Checking…', tone: 'neutral' };
  if (!status.configured) return { value: 'No keys on the laptop', tone: 'waiting' };
  if (status.devices === 0) return { value: 'On, no phones yet', tone: 'waiting' };
  return {
    value: `On, ${status.devices} phone${status.devices === 1 ? '' : 's'}`,
    tone: 'done',
  };
}

export function SystemStatus() {
  const [push, setPush] = useState<PushStatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.push
      .status()
      .then((status) => {
        if (!cancelled) setPush(status);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const pushState = pushRow(push);

  const rows: { label: string; value: string; tone: Tone }[] = [
    { label: 'Backend', value: 'Online', tone: 'done' },
    { label: 'Last contact with server', value: '30 seconds ago', tone: 'done' },
    { label: 'Database', value: 'Not configured yet', tone: 'waiting' },
    { label: 'Push notifications', value: pushState.value, tone: pushState.tone },
    { label: 'Last successful backup', value: 'No backup yet', tone: 'waiting' },
    { label: 'App version', value: '0.1.0 (Stage 2 preview)', tone: 'neutral' },
    { label: 'Household timezone', value: settings.timezone, tone: 'neutral' },
  ];

  return (
    <>
      <ScreenTop title="System status" back="/parent/settings" />
      <main className="screen">
        <div className="stack stack--tight">
          {rows.map((row) => (
            <div key={row.label} className="card row">
              <span style={{ flex: 1 }}>{row.label}</span>
              <Badge tone={row.tone} icon={row.tone === 'done' ? 'check' : row.tone === 'waiting' ? 'clock' : undefined}>
                {row.value}
              </Badge>
            </div>
          ))}
        </div>

        {push && !push.configured && (
          <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
            Reminders reach the inbox either way. To make them reach a phone, run{' '}
            <code>npm run vapid</code> on the laptop, put the three lines it prints into{' '}
            <code>backend/.env</code>, and restart the server.
          </p>
        )}

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
