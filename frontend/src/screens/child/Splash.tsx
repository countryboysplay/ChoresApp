import { useNavigate } from 'react-router-dom';
import { Button } from '../../design/primitives';
import { useSkyBackground } from '../../hooks/useSkyBackground';
import { playSound } from '../../design/sound';

/** The ground color, shared by the hill artwork and the panel beneath it. */
const GROUND = '#2e7d32';

export function Splash() {
  useSkyBackground();
  const navigate = useNavigate();

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

      {/*
        Scene and buttons are one flex item, not two. As siblings the column's
        space-between opened a band of sky between the ground and the panel,
        which broke the illusion that they are the same surface.
      */}
      <div>
        <Scene />
        {/*
          The buttons sit on the ground rather than on sky below it. The scene's
          bottom edge is solid GROUND, so this panel continues the same color to
          the bottom of the screen and the two read as one surface.
        */}
        <div
          className="bleed"
          style={{
            background: GROUND,
            paddingInline: 'var(--space-4)',
            paddingBottom: 'max(var(--space-5), env(safe-area-inset-bottom))',
          }}
        >
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
            <Button tone="dark" block onClick={() => navigate('/profiles')}>
              Select profile
            </Button>
          </div>
        </div>
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

/**
 * Code-drawn scene. No raster assets and no image generation.
 *
 * Three layers, because they do not want the same thing from scaling. The hills
 * must touch both screen edges at any width, so they bleed past the screen
 * padding and stretch horizontally - non-uniform scaling is invisible on an
 * organic curve. The castle must keep its proportions, so it is a separate
 * fixed-size layer. The hills paint last, which roots the castle in the slope
 * instead of pasting it on top.
 */
function Scene() {
  return (
    <div className="bleed" style={{ position: 'relative', height: 240 }} aria-hidden="true">
      <svg
        viewBox="0 0 320 60"
        preserveAspectRatio="none"
        style={{ position: 'absolute', insetInline: 0, top: 0, width: '100%', height: 60, display: 'block' }}
      >
        <ellipse cx="60" cy="32" rx="30" ry="13" fill="#ffffff" opacity="0.85" />
        <ellipse cx="250" cy="20" rx="34" ry="14" fill="#ffffff" opacity="0.75" />
      </svg>

      <svg
        viewBox="104 58 112 100"
        width="150"
        height="135"
        style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 70, display: 'block' }}
      >
        <rect x="118" y="96" width="84" height="60" rx="6" fill="#e9eef7" />
        <rect x="106" y="80" width="26" height="76" rx="5" fill="#dfe6f3" />
        <rect x="188" y="80" width="26" height="76" rx="5" fill="#dfe6f3" />
        <path d="M106 80h26l-13-18ZM188 80h26l-13-18Z" fill="#e53935" />
        <path d="M118 96h84l-42-24Z" fill="#e53935" />
        <rect x="150" y="124" width="20" height="32" rx="9" fill="#8d6e63" />
      </svg>

      <svg
        viewBox="0 0 320 50"
        preserveAspectRatio="none"
        style={{ position: 'absolute', insetInline: 0, bottom: 0, width: '100%', height: 100, display: 'block' }}
      >
        <path d="M0 0c40-18 80-18 120 0s80 18 120 0 60-10 80-4v54H0Z" fill="#4caf50" />
        <path d="M0 18c50-14 90-8 140 4s110 6 180-6v34H0Z" fill={GROUND} />
      </svg>
    </div>
  );
}
