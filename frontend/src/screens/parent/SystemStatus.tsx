import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type {
  BackupsResponse,
  CertificateResponse,
  HealthResponse,
  PushStatusResponse,
} from '@chore-quest/shared';
import { Icon } from '../../design/icons';
import { Badge, Button } from '../../design/primitives';
import { ScreenTop } from '../../components/ScreenTop';
import { api, ApiRequestError } from '../../lib/api';
import { installWaitingUpdate, isUpdateWaiting, subscribeToUpdates } from '../../lib/appUpdate';

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

/**
 * The certificate is what makes the camera and phone notifications work off
 * this laptop, and its failure is silent - it expires on a Tuesday and takes
 * those two things with it. A number of days on a screen is what turns that
 * into something noticed a month early rather than discovered.
 */
function certificateRow(cert: CertificateResponse | null): { value: string; tone: Tone } {
  if (!cert) return { value: 'Checking…', tone: 'neutral' };
  if (!cert.hostnameConfigured) return { value: 'Not set up', tone: 'waiting' };
  if (!cert.present) return { value: 'No certificate yet', tone: 'waiting' };

  const days = cert.daysRemaining ?? 0;
  if (days <= 0) return { value: 'Expired', tone: 'late' };
  // Past the renewal window with no renewal having happened means something is
  // wrong that will not fix itself.
  if (days <= cert.renewWithinDays && !cert.renewable) {
    return { value: `${days} days left, renew by hand`, tone: 'late' };
  }
  if (days <= 7) return { value: `${days} days left`, tone: 'late' };
  return { value: `${days} days left`, tone: 'done' };
}

function backupRow(data: BackupsResponse | null): { value: string; tone: Tone } {
  if (!data) return { value: 'Checking…', tone: 'neutral' };
  const failed = data.backups[0]?.status === 'failed';
  if (failed) return { value: 'Last attempt failed', tone: 'late' };
  if (!data.lastGood) return { value: 'No backup yet', tone: 'waiting' };
  return { value: ago(data.lastGood.at), tone: 'done' };
}

/** How long the server has been up, in words a person reads at a glance. */
function uptime(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

const DATABASE_LABEL: Record<HealthResponse['database'], { value: string; tone: Tone }> = {
  connected: { value: 'Connected', tone: 'done' },
  unreachable: { value: 'Unreachable', tone: 'late' },
  not_configured: { value: 'Not configured', tone: 'waiting' },
};

/**
 * Every row here now reads something real.
 *
 * Until Stage 17 the top four were Stage 2 placeholders - a fixed "Online", a
 * fixed "30 seconds ago", a database that always claimed to be unconfigured,
 * and a version string still saying "Stage 2 preview" four stages later. A
 * status screen that reports a comforting guess is worse than one that admits
 * it does not know, because it is read precisely when somebody is trying to
 * find out what is wrong.
 */
export function SystemStatus() {
  const [push, setPush] = useState<PushStatusResponse | null>(null);
  const [backups, setBackups] = useState<BackupsResponse | null>(null);
  const [cert, setCert] = useState<CertificateResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The one place in the app that admits an update is waiting. A child's phone
  // never asks, so a child is never offered a reload they did not want.
  const updateWaiting = useSyncExternalStore(subscribeToUpdates, isUpdateWaiting);

  const load = useCallback(async () => {
    await Promise.all([
      api.push.status().then(setPush).catch(() => undefined),
      api.backups.list().then(setBackups).catch(() => undefined),
      api.certificate.status().then(setCert).catch(() => undefined),
      api.health().then(setHealth).catch(() => setHealth(null)),
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
  const certState = certificateRow(cert);

  const database = health ? DATABASE_LABEL[health.database] : { value: 'Checking…', tone: 'neutral' as Tone };

  const rows: { label: string; value: string; tone: Tone }[] = [
    // If this screen rendered at all the server answered, so "Online" is not a
    // guess - but it is only worth saying alongside how long it has been up,
    // which is what tells a parent whether it has been restarting all evening.
    {
      label: 'Backend',
      value: health ? `Online, up ${uptime(health.uptimeSeconds)}` : 'Not answering',
      tone: health ? 'done' : 'late',
    },
    { label: 'Database', value: database.value, tone: database.tone },
    { label: 'Push notifications', value: pushState.value, tone: pushState.tone },
    { label: 'Last successful backup', value: backupState.value, tone: backupState.tone },
    { label: 'Certificate', value: certState.value, tone: certState.tone },
    {
      label: 'App version',
      value: health ? `${health.version} (${health.environment})` : 'Unknown',
      tone: 'neutral',
    },
    {
      label: 'Household timezone',
      value: health?.household.timezone ?? 'Unknown',
      tone: 'neutral',
    },
    {
      label: 'Household date',
      value: health ? `${health.household.choreDate}, ${health.household.localTime.slice(11, 16)}` : 'Unknown',
      tone: 'neutral',
    },
  ];

  return (
    <>
      <ScreenTop title="System status" back="/parent/settings" />
      <main className="screen">
        {/*
          Above everything else, because a parent who came here to work out why
          the app looks wrong has usually found their answer in this one line.
        */}
        {updateWaiting && (
          <section className="card stack stack--tight" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="row row--between">
              <span className="row" style={{ gap: 'var(--space-2)' }}>
                <Icon name="alert" size={18} />
                <strong>A new version is ready</strong>
              </span>
              <Badge tone="info">Waiting</Badge>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              It installs itself once every tab of the app has been closed, which on a phone can
              mean never. This takes it now and reloads. Only this phone is affected — nobody
              else is interrupted.
            </p>
            <Button tone="go" block icon="check" onClick={() => installWaitingUpdate()}>
              Install it now
            </Button>
          </section>
        )}

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

        {cert && !cert.present && (
          <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
            Without a certificate the app runs on plain http, so the camera and phone reminders
            only work on this laptop — browsers allow neither over http on a wifi address. Run{' '}
            <code>npm run cert -- --issue</code> on the laptop once the domain is set up.
          </p>
        )}

        {cert && cert.present && !cert.renewable && (
          <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
            <Icon name="alert" size={14} /> Automatic renewal is not configured, so this
            certificate has to be replaced by hand before it expires.
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
