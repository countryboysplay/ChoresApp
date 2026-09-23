import { useNavigate } from 'react-router-dom';
import { Button } from '../../design/primitives';
import { Icon } from '../../design/icons';
import { useSkyBackground } from '../../hooks/useSkyBackground';
import { playSound } from '../../design/sound';

/** The plaque color beneath the scene, shared by the ground panel and buttons. */
const GROUND = '#1b1712';

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
        space-between opened a band of background between the scene and the
        panel, which broke the illusion that they are the same surface.
      */}
      <div>
        <Scene />
        {/*
          The buttons sit on the same plaque as the compass rests on. The
          scene's bottom edge is solid GROUND, so this panel continues the
          same color to the bottom of the screen and the two read as one
          surface - a stone plinth rather than a floating card.
        */}
        <div
          className="bleed"
          style={{
            background: GROUND,
            paddingInline: 'var(--space-4)',
            paddingBottom: 'max(var(--space-5), env(safe-area-inset-bottom))',
            borderTop: '1px solid rgba(176, 141, 87, 0.35)',
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
        <Icon name="compass" size={32} style={{ color: 'var(--gold)' }} />
      </div>
    </div>
  );
}

/**
 * Code-drawn scene. No raster assets and no image generation - the compass
 * rose is built from the same stroke logic as the `compass` icon, just
 * larger, so it reads as this app's signature sigil rather than a stock
 * graphic.
 *
 * Three layers, same reasoning as the design it replaces: a faint radial glow
 * bleeds to both screen edges at any width; the compass housing keeps its
 * proportions as a fixed-size centered layer; the ground panel paints last,
 * rooting the compass in the plinth instead of floating it on empty sky.
 */
function Scene() {
  return (
    <div className="bleed" style={{ position: 'relative', height: 240 }} aria-hidden="true">
      <svg
        viewBox="0 0 320 240"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          <radialGradient id="splash-glow" cx="50%" cy="38%" r="55%">
            <stop offset="0%" stopColor="#b08d57" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#b08d57" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="320" height="240" fill="url(#splash-glow)" />
      </svg>

      <svg
        viewBox="0 0 120 120"
        width="180"
        height="180"
        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -58%)', display: 'block' }}
      >
        <circle cx="60" cy="60" r="52" fill="none" stroke="#b08d57" strokeWidth="1.5" opacity="0.55" />
        <circle cx="60" cy="60" r="40" fill="none" stroke="#b08d57" strokeWidth="1" opacity="0.4" />
        {/* Cardinal ticks */}
        <g stroke="#b08d57" strokeWidth="1.5" opacity="0.6">
          <path d="M60 4v10M60 106v10M4 60h10M106 60h10" />
        </g>
        {/* The four-point star, echoing the `compass` icon */}
        <path
          d="M60 14 68 52 106 60 68 68 60 106 52 68 14 60 52 52Z"
          fill="none"
          stroke="#e7e1d6"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="60" cy="60" r="6" fill="#b08d57" />
      </svg>

      <svg
        viewBox="0 0 320 60"
        preserveAspectRatio="none"
        style={{ position: 'absolute', insetInline: 0, bottom: 0, width: '100%', height: 90, display: 'block' }}
      >
        <path d="M0 20c50-12 90-8 140 2s110 4 180-8v46H0Z" fill={GROUND} />
      </svg>
    </div>
  );
}
