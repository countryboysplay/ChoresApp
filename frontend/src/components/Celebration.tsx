/**
 * Full-screen celebration built from the NEON pack's celebration layers:
 * ring-burst and particle-dots behind the hero art, confetti/sparkle/star
 * sprites around it. Purely presentational - callers decide when to show it.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import confetti from 'canvas-confetti';
import { prefersReducedMotion } from '../lib/motion';
import DecryptedText from '../design/DecryptedText';
import { NeonArt } from '../design/neon';
import { playSound, type SoundName } from '../design/sound';

export type CelebrationKind =
  | 'chore-approved'
  | 'level-up'
  | 'badge-unlocked'
  | 'reward-unlocked'
  | 'streak-milestone';

const SOUND: Record<CelebrationKind, SoundName> = {
  'chore-approved': 'approve',
  'level-up': 'levelUp',
  'badge-unlocked': 'achievement',
  'reward-unlocked': 'redeem',
  'streak-milestone': 'achievement',
};

export function Celebration({
  kind,
  title,
  children,
  art,
  onClose,
}: {
  kind: CelebrationKind;
  title: string;
  /** Stats or a line of text under the title. */
  children?: ReactNode;
  /** Replaces the hero art (e.g. the actual badge that was earned). */
  art?: ReactNode;
  onClose: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    playSound(SOUND[kind]);
    const stopBurst = burst(kind);
    // Give focus back where it was on close, so a screen-reader user keeps their place.
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    button.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stopBurst();
      if (before?.isConnected) before.focus();
    };
  }, [kind, onClose]);

  // Portalled to <body>: a transformed ancestor (the screen transition) would
  // otherwise make this fixed overlay move with the screen.
  return createPortal(
    <div className="celebration" role="dialog" aria-modal="true" aria-label={title}>
      <div className="celebration__stage" aria-hidden="true">
        <NeonArt group="celebrations" name="ring-burst" className="celebration__ring" />
        <NeonArt group="celebrations" name="particle-dots" className="celebration__dots" />
        <NeonArt group="ui" name="confetti" className="celebration__confetti" />
        <NeonArt group="ui" name="sparkle" className="celebration__sprite celebration__sprite--a" />
        <NeonArt group="ui" name="star" className="celebration__sprite celebration__sprite--b" />
        <NeonArt group="ui" name="sparkle" className="celebration__sprite celebration__sprite--c" />
        <div className="celebration__hero">{art ?? <NeonArt group="celebrations" name={kind} />}</div>
      </div>
      <h2 className="celebration__title">
        {kind === 'level-up' ? <DecryptedText text={title} animateOn="view" speed={40} maxIterations={14} /> : title}
      </h2>
      {children ? <div className="celebration__body">{children}</div> : null}
      <button ref={button} type="button" className="btn btn--primary btn--lg celebration__button" onClick={onClose}>
        Awesome!
      </button>
    </div>,
    document.body,
  );
}

/** "+150 XP  +50 coins" style reward line for a celebration. */
export function CelebrationStats({ xp, coins }: { xp?: number; coins?: number }) {
  return (
    <div className="celebration__stats">
      {xp ? (
        <span>
          <NeonArt group="icons" name="xp" size={40} />
          <strong>+{xp.toLocaleString('en-US')} XP</strong>
        </span>
      ) : null}
      {coins ? (
        <span>
          <NeonArt group="icons" name="coin" size={40} />
          <strong>+{coins.toLocaleString('en-US')} coins</strong>
        </span>
      ) : null}
    </div>
  );
}

const BURST_COLORS = ['#40e4ff', '#aa69ff', '#4fe0a4', '#f7c76b', '#ffffff'];

/** Two angled cannons from the bottom corners; level-ups get a second, bigger wave. Returns a cancel. */
function burst(kind: CelebrationKind): () => void {
  if (prefersReducedMotion()) return () => {};
  const shoot = (scale: number) => {
    const base = { colors: BURST_COLORS, zIndex: 120, ticks: 220, gravity: 0.9, scalar: 0.9, disableForReducedMotion: true };
    void confetti({ ...base, particleCount: Math.round(70 * scale), angle: 60, spread: 60, startVelocity: 55 * scale, origin: { x: 0, y: 0.9 } });
    void confetti({ ...base, particleCount: Math.round(70 * scale), angle: 120, spread: 60, startVelocity: 55 * scale, origin: { x: 1, y: 0.9 } });
  };
  shoot(1);
  if (kind !== 'level-up' && kind !== 'badge-unlocked') return () => {};
  // Cleared on close, so a quick tap does not get a second wave after the overlay is gone.
  const second = window.setTimeout(() => shoot(1.25), 350);
  return () => window.clearTimeout(second);
}
