import { useEffect } from 'react';

/** Pre-login screens use the bright sky background from the design board. */
export function useSkyBackground(): void {
  useEffect(() => {
    document.body.classList.add('is-sky');
    return () => document.body.classList.remove('is-sky');
  }, []);
}
