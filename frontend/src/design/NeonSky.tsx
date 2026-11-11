import { useEffect } from 'react';
import { prefersReducedMotion } from '../lib/motion';

/**
 * The living backdrop behind the kid and sign-in screens: drifting aurora,
 * two depths of stars and a grid horizon running toward the player. The parent
 * shell covers it (and system.css switches it off there).
 *
 * `body[data-sky='clear']` - set by the kid shell once every required chore is
 * approved - turns the aurora from cyan-violet to mint and gold.
 */
export function NeonSky() {
  return (
    <div className="neon-sky" aria-hidden="true">
      <div className="neon-sky__aurora">
        <i className="neon-sky__blob neon-sky__blob--cyan" />
        <i className="neon-sky__blob neon-sky__blob--violet" />
        <i className="neon-sky__blob neon-sky__blob--pink" />
        <i className="neon-sky__blob neon-sky__blob--mint" />
        <i className="neon-sky__blob neon-sky__blob--gold" />
      </div>
      <div className="neon-sky__stars neon-sky__stars--far" />
      <div className="neon-sky__stars neon-sky__stars--near" />
      <div className="neon-sky__horizon">
        <div className="neon-sky__grid" />
      </div>
    </div>
  );
}

/** Sets the sky's mood for as long as the caller is mounted. */
export function useSkyMood(clear: boolean): void {
  useEffect(() => {
    if (clear) document.body.dataset.sky = 'clear';
    else delete document.body.dataset.sky;
    return () => {
      delete document.body.dataset.sky;
    };
  }, [clear]);
}

const TILT_TILES = '.neon-reward, .neon-achievement, .neon-stat';

/**
 * Kid tiles lean toward the pointer (or the finger, while pressed) with a glare
 * where it touches. One delegated listener for the whole shell.
 */
export function useTileTilt(): void {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let current: HTMLElement | null = null;

    const release = () => {
      if (!current) return;
      current.removeAttribute('data-tilt');
      current = null;
    };

    const track = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const tile = target?.closest<HTMLElement>(TILT_TILES) ?? null;
      if (tile !== current) release();
      // Touch tilts only while the finger is down.
      if (!tile || (event.pointerType !== 'mouse' && event.buttons === 0)) return;
      const box = tile.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      tile.style.setProperty('--rx', `${(-y * 12).toFixed(2)}deg`);
      tile.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
      tile.style.setProperty('--gx', `${Math.round((x + 0.5) * 100)}%`);
      tile.style.setProperty('--gy', `${Math.round((y + 0.5) * 100)}%`);
      tile.setAttribute('data-tilt', '');
      current = tile;
    };

    const end = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') release();
    };

    document.addEventListener('pointerdown', track, { passive: true });
    document.addEventListener('pointermove', track, { passive: true });
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', release);
    document.documentElement.addEventListener('pointerleave', release);
    return () => {
      release();
      document.removeEventListener('pointerdown', track);
      document.removeEventListener('pointermove', track);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', release);
      document.documentElement.removeEventListener('pointerleave', release);
    };
  }, []);
}
