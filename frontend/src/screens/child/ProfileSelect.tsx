import { useNavigate } from 'react-router-dom';
import type { AvatarConfig } from '../../design/Avatar';
import { Avatar, DEFAULT_AVATAR } from '../../design/Avatar';
import { Icon } from '../../design/icons';
import { Button } from '../../design/primitives';
import { levelForLifetimePoints } from '../../config/levels';
import { useAuth } from '../../lib/auth';
import { useSkyBackground } from '../../hooks/useSkyBackground';
import { playSound } from '../../design/sound';

export function ProfileSelect() {
  useSkyBackground();
  const navigate = useNavigate();
  const { mode, profiles } = useAuth();

  const childProfiles = profiles.filter((profile) => profile.role === 'child');
  const parentProfiles = profiles.filter((profile) => profile.role === 'parent');

  if (mode === 'loading') {
    return (
      <main className="screen screen--sky" style={{ paddingTop: 'var(--space-6)' }}>
        <h1 className="title" style={{ textAlign: 'center' }}>Choose your hero</h1>
        <p style={{ textAlign: 'center', marginTop: 'var(--space-5)' }} aria-live="polite">
          Loading profiles&hellip;
        </p>
      </main>
    );
  }

  return (
    <main className="screen screen--sky" style={{ paddingTop: 'var(--space-6)' }}>
      <h1 className="title" style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
        Choose your hero
      </h1>

      {profiles.length === 0 && (
        // The first run on a fresh database. Says what to do rather than showing
        // an empty screen with no explanation.
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>No profiles yet</p>
          <p style={{ color: 'var(--text-muted)' }}>
            Add the first one on the laptop with{' '}
            <code>npm run user -w backend -- --role parent --name &quot;Your name&quot;</code>
          </p>
        </div>
      )}

      <div className="stack">
        {childProfiles.map((child) => {
          const level = levelForLifetimePoints(child.lifetimePoints ?? 0);
          return (
            <button
              key={child.id}
              type="button"
              className="panel panel--purple card--interactive row"
              style={{ gap: 'var(--space-4)' }}
              onClick={() => {
                playSound('tap');
                navigate(`/pin/${child.id}`);
              }}
            >
              <Avatar
                config={(child.avatar as AvatarConfig | null) ?? DEFAULT_AVATAR}
                size={84}
                label={`${child.displayName} avatar`}
              />
              <span style={{ flex: 1, textAlign: 'center' }}>
                <span
                  className="logo"
                  style={{ display: 'block', fontSize: 'var(--text-2xl)', color: '#fff', textShadow: 'none' }}
                >
                  {child.displayName}
                </span>
                <span style={{ display: 'block', fontWeight: 700, marginTop: 4 }}>Level {level.level}</span>
                <span className="numeric" style={{ display: 'block', fontWeight: 700 }}>
                  {(child.lifetimePoints ?? 0).toLocaleString('en-US')} pts
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Button tone="dark" size="lg" block icon="plus" style={{ marginTop: 'var(--space-5)' }}>
        Add profile
      </Button>

      <hr className="divider" style={{ background: 'rgba(255,255,255,0.35)' }} />

      <div className="stack stack--tight">
        {parentProfiles.map((parent) => (
          <button
            key={parent.id}
            type="button"
            className="card card--interactive row"
            onClick={() => navigate(`/pin/${parent.id}`)}
          >
            <span className="iconbtn">
              <Icon name="user" size={22} />
            </span>
            <span style={{ fontWeight: 700, flex: 1 }}>{parent.displayName}</span>
            <span className="badge badge--info">Parent</span>
          </button>
        ))}
      </div>
    </main>
  );
}
