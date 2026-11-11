import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { Button } from '../../design/primitives';
import { NeonArt } from '../../design/neon';
import { useSkyBackground } from '../../hooks/useSkyBackground';
import { playSound } from '../../design/sound';

export function Splash() {
  useSkyBackground();
  const navigate = useNavigate();
  const { mode, user } = useAuth();

  // The installed app always opens here (manifest start_url), so a still-valid
  // session must skip straight past the profile picker.
  if (user) return <Navigate to={user.role === 'parent' ? '/parent' : '/child/home'} replace />;
  // Still asking the server who is signed in: show only the sky, so a remembered
  // kid goes straight to Today instead of glimpsing the sign-in buttons first.
  if (mode === 'loading') return <main className="screen screen--sky" aria-busy="true" />;

  return (
    <main
      className="screen screen--sky screen--grounded"
      style={{ justifyContent: 'space-between', paddingTop: 'var(--space-7)' }}
    >
      <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-2)' }}>
        <Logo />
        <p
          className="eyebrow"
          style={{ fontSize: 'var(--text-base)', letterSpacing: '0.06em', textAlign: 'center', marginTop: 'var(--space-3)' }}
        >
          Turn chores
          <br />
          into victories
        </p>
      </div>

      <Scene />

      <div className="bleed id-deck">
        <div className="stack stack--tight">
          <Button
            tone="purple"
            size="lg"
            block
            onClick={() => {
              playSound('success');
              navigate('/profiles');
            }}
          >
            Let&apos;s go
          </Button>
          <Button tone="dark" block icon="users" onClick={() => navigate('/profiles')}>
            Select profile
          </Button>
        </div>
      </div>
    </main>
  );
}

/** The pack's splash logo, cropped to its art (the SVG's canvas is mostly empty). */
function Logo() {
  return (
    <h1 className="id-crop id-crop--splash" style={{ width: 'min(80vw, 340px)', marginBlock: 0 }}>
      <NeonArt group="brand" name="splash-logo" alt="Chore Quest" />
    </h1>
  );
}

/** The app icon, floating mid-screen above the button deck. */
function Scene() {
  return (
    <NeonArt
      group="brand"
      name="app-icon"
      className="float"
      style={{ width: 'min(42vw, 200px)', height: 'auto', margin: '0 auto', filter: 'drop-shadow(0 0 40px rgba(64, 228, 255, 0.45))' }}
    />
  );
}
