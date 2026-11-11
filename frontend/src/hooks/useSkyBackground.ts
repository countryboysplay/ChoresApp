import { useEffect } from 'react';
import '../design/neon-hud.css';

/** Pre-login screens use the bright sky background and the kid HUD skin (body.kid). */
export function useSkyBackground(): void {
  useEffect(() => {
    document.body.classList.add('is-sky', 'kid');
    return () => document.body.classList.remove('is-sky', 'kid');
  }, []);
}
