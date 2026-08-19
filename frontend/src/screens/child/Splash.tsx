import { useNavigate } from 'react-router-dom';
import { Button } from '../../design/primitives';
import { useSkyBackground } from '../../hooks/useSkyBackground';
import { playSound } from '../../design/sound';

export function Splash() {
  useSkyBackground();
  const navigate = useNavigate();

  return (
    <main className="screen screen--sky" style={{ justifyContent: 'space-between', paddingTop: 'var(--space-7)' }}>
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

      <div className="stack stack--tight" style={{ paddingBottom: 'var(--space-6)' }}>
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
        <Button tone="dark" block onClick={() => navigate('/profiles')}>
          Select profile
        </Button>
      </div>
    </main>
  );
}

function Logo() {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="logo" style={{ fontSize: '2.9rem' }}>Chore</div>
      <div className="row" style={{ justifyContent: 'center', gap: 'var(--space-2)' }}>
        <span className="logo" style={{ fontSize: '2.9rem' }}>Quest</span>
        <svg width="34" height="42" viewBox="0 0 34 42" aria-hidden="true">
          <path d="M17 1 3 24h11L11 41 31 16H19l6-15Z" fill="#ffc107" stroke="#b06a00" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

/** Code-drawn scene. No raster assets and no image generation. */
function Scene() {
  return (
    <svg viewBox="0 0 320 200" style={{ width: '100%', maxWidth: 360, margin: '0 auto' }} aria-hidden="true">
      <ellipse cx="60" cy="34" rx="30" ry="14" fill="#ffffff" opacity="0.85" />
      <ellipse cx="250" cy="24" rx="34" ry="15" fill="#ffffff" opacity="0.75" />
      <path d="M0 150c40-18 80-18 120 0s80 18 120 0 60-10 80-4v54H0Z" fill="#4caf50" />
      <path d="M0 168c50-14 90-8 140 4s110 6 180-6v34H0Z" fill="#2e7d32" />
      <g>
        <rect x="118" y="96" width="84" height="60" rx="6" fill="#e9eef7" />
        <rect x="106" y="80" width="26" height="76" rx="5" fill="#dfe6f3" />
        <rect x="188" y="80" width="26" height="76" rx="5" fill="#dfe6f3" />
        <path d="M106 80h26l-13-18ZM188 80h26l-13-18Z" fill="#e53935" />
        <path d="M118 96h84l-42-24Z" fill="#e53935" />
        <rect x="150" y="124" width="20" height="32" rx="9" fill="#8d6e63" />
      </g>
      <path d="M150 200c-6-24 4-38 10-44 6 6 16 20 10 44Z" fill="#c8a165" opacity="0.7" />
    </svg>
  );
}
