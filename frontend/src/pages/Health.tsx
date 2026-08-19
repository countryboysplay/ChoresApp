import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse } from '@chore-quest/shared';
import { api, ApiRequestError } from '../lib/api';

type Status =
  | { state: 'checking' }
  | { state: 'connected'; health: HealthResponse }
  | { state: 'unreachable'; message: string };

export function Health() {
  const [status, setStatus] = useState<Status>({ state: 'checking' });

  const check = useCallback(async () => {
    setStatus({ state: 'checking' });
    try {
      const health = await api.health();
      setStatus({ state: 'connected', health });
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : 'Cannot reach the Chore Quest server.';
      setStatus({ state: 'unreachable', message });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <main className="screen">
      <h1 style={{ fontSize: 'var(--text-3xl)' }}>Server check</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Diagnostics page. The app itself starts at the player select screen.
      </p>

      <section className="card" style={{ marginTop: 'var(--space-5)' }} aria-live="polite">
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Server connection</h2>

        {status.state === 'checking' && (
          <p className="badge badge--waiting">
            <span aria-hidden="true">⏳</span> Checking…
          </p>
        )}

        {status.state === 'connected' && (
          <>
            <p className="badge badge--ok">
              <span aria-hidden="true">✓</span> Connected
            </p>
            <dl style={{ display: 'grid', gap: 'var(--space-2)', marginBottom: 0 }}>
              <Row label="API version" value={status.health.version} />
              <Row label="Environment" value={status.health.environment} />
              <Row label="Household time" value={status.health.household.localTime} />
              <Row label="Chore day" value={status.health.household.choreDate} />
              <Row label="Database" value={status.health.database.replace('_', ' ')} />
            </dl>
          </>
        )}

        {status.state === 'unreachable' && (
          <>
            <p className="badge badge--down">
              <span aria-hidden="true">!</span> Not connected
            </p>
            <p className="muted">{status.message}</p>
            <p className="muted">
              Start the backend on the Windows laptop with <code>npm run dev:backend</code>.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={() => void check()}
          style={{
            marginTop: 'var(--space-4)',
            width: '100%',
            border: 'none',
            borderRadius: 'var(--radius-pill)',
            padding: '0 var(--space-5)',
            fontWeight: 800,
            color: '#fff',
            background: 'linear-gradient(180deg, var(--blue), var(--purple))',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          Check again
        </button>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
      <dt className="muted">{label}</dt>
      <dd style={{ margin: 0, fontWeight: 700 }}>{value}</dd>
    </div>
  );
}
