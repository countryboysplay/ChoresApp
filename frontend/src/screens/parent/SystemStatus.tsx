import { useCallback, useEffect, useState } from 'react';
import type { BackupsResponse, PushStatusResponse } from '@chore-quest/shared';
import { Icon } from '../../design/icons';
import { Badge, Button } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';
import { settings } from '../../mock/data';

type Tone = 'done' | 'waiting' | 'late' | 'neutral';

function pushRow(status: PushStatusResponse | null): { value: string; tone: Tone } {
  if (!status) return { value: 'Checking…', tone: 'neutral' };
  if (!status.configured) return { value: 'No keys on the laptop', tone: 'waiting' };
  if (status.devices === 0) return { value: 'On, no phones yet', tone: 'waiting' };
  return {
    value: `On, ${status.devices} phone${status.devices === 1 ? '' : 's'}`,
    tone: 'done',
  };
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function size(bytes: number | null): string {
  if (bytes === null) return '';
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb.toFixed(1)} MB`;
}

function backupRow(data: BackupsResponse | null): { value: string; tone: Tone } {
  if (!data) return { value: 'Checking…', tone: 'neutral' };
  const failed = data.backups[0]?.status === 'failed';
  if (failed) return { value: 'Last attempt failed', tone: 'late' };
  if (!data.lastGood) return { value: 'No backup yet', tone: 'waiting' };
  return { value: ago(data.lastGood.at), tone: 'done' };
}

/**
 * The rows that are real, and the ones that are not.
 *
 * Push and backups read the API. Backend uptime, database, and app version are
 * still the Stage 2 placeholders and belong with the Stage 17 production build;
 * they are left visibly as they were rather than half-wired, because a status
 * screen that reports a comforting guess is worse than one that has not been
 * written yet.
 */
export function SystemStatus() {
  const [push, setPush] = useState<PushStatusResponse | null>(null);
  const [backups, setBackups] = useState<BackupsResponse | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    await Promise.all([
      api.push.status().then(setPush).catch(() => undefined),
      api.backups.list().then(setBackups).catch(() => undefined),
    ]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const backUpNow = async () => {
    setWorking(true);
    setNotice(null);
    setError(null);
    try {
      const { backup } = await api.backups.runNow();
      setNotice(
        `Backed up ${size(backup.bytes)}${backup.photoCount ? `, ${backup.photoCount} photos` : ''}` +
          `${backup.mirrored ? ', copied to the drive' : ''}.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'The backup did not finish.');
      await load();
    } finally {
      setWorking(false);
    }
  };

  const pushState = pushRow(push);
  const backupState = backupRow(backups);

  const rows: { label: string; value: string; tone: Tone }[] = [
    { label: 'Backend', value: 'Online', tone: 'done' },
    { label: 'Last contact with server', value: '30 seconds ago', tone: 'done' },
    { label: 'Database', value: 'Not configured yet', tone: 'waiting' },
    { label: 'Push notifications', value: pushState.value, tone: pushState.tone },
    { label: 'Last successful backup', value: backupState.value, tone: backupState.tone },
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

        <section className="card stack stack--tight" style={{ marginTop: 'var(--space-5)' }}>
          <div className="row row--between">
            <span className="row" style={{ gap: 'var(--space-2)' }}>
              <Icon name="lock" size={18} />
              <strong>Backups</strong>
            </span>
            {backups && (
              <Badge tone={backups.mirrorConnected ? 'done' : 'waiting'}>
                {backups.mirrorConnected
                  ? 'Drive connected'
                  : backups.mirrorConfigured
                    ? 'Drive not plugged in'
                    : 'Laptop only'}
              </Badge>
            )}
          </div>

          {backups && (
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              Taken automatically every night, keeping {backups.retention.daily} days and then{' '}
              {backups.retention.weekly} weeks. Each one holds the database and every chore photo.
            </p>
          )}

          {/* Stated plainly rather than left to be inferred. A household that
              believes it has an off-laptop copy and does not is worse off than
              one that knows, because the first never goes looking for the drive. */}
          {backups && !backups.mirrorConnected && (
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              <Icon name="alert" size={14} />{' '}
              {backups.mirrorConfigured
                ? 'The backup drive is not plugged in, so tonight’s backup will only exist on this laptop.'
                : 'Backups exist only on this laptop. That covers a mistake or a damaged database, but not a dead disk or a lost machine. Set BACKUP_MIRROR_DIR in backend/.env to a USB drive to keep a second copy.'}
            </p>
          )}

          {notice && (
            <p className="badge badge--done" style={{ padding: 'var(--space-2)' }}>
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="badge badge--late" style={{ padding: 'var(--space-2)' }}>
              {error}
            </p>
          )}

          <Button tone="quiet" block icon="lock" disabled={working} onClick={() => void backUpNow()}>
            {working ? 'Backing up…' : 'Back up now'}
          </Button>

          {backups && backups.backups.length > 0 && (
            <div className="stack stack--tight" style={{ marginTop: 'var(--space-2)' }}>
              {backups.backups.slice(0, 5).map((entry) => (
                <div key={entry.id} className="row row--between" style={{ fontSize: 'var(--text-sm)' }}>
                  <span className="muted">
                    {ago(entry.at)} · {entry.kind === 'manual' ? 'by hand' : 'nightly'}
                  </span>
                  <Badge tone={entry.status === 'ok' ? 'done' : entry.status === 'failed' ? 'late' : 'neutral'}>
                    {entry.status === 'ok'
                      ? `${size(entry.bytes)}${entry.mirrored ? ' · copied' : ''}`
                      : entry.status === 'failed'
                        ? 'Failed'
                        : 'Running'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
          <strong>Restoring</strong>
          {/* Not a button. Replacing every chore, point, and photo with an older
              copy is the one action in the app with no undo, so it lives where
              an argument, a mis-tap, or a child on an unlocked phone cannot
              reach it - the same reasoning that keeps parent accounts on the
              laptop. A server also cannot rebuild the database it is using. */}
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Restoring replaces everything in the household and cannot be undone, so it is done from
            the laptop rather than from here. Stop the server, then run:
          </p>
          <code style={{ display: 'block', fontSize: 'var(--text-sm)' }}>npm run restore -- --list</code>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            That shows every backup. Restore one with{' '}
            <code>npm run restore -- --from &lt;folder&gt;</code>, which asks you to type RESTORE
            before it does anything.
          </p>
        </section>
      </main>
    </>
  );
}
