import { useEffect, useRef, useState } from 'react';
import { deviceMemory } from './deviceMemory';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * A number that counts to `target` instead of jumping. Interrupting it mid-count
 * carries on from wherever it had got to. The first known value, and every value
 * under reduced motion, lands immediately. `undefined` = not known yet.
 */
export function useTween<T extends number | undefined>(target: T, ms = 900): T {
  const [shown, setShown] = useState<T>(target);
  const current = useRef<number | undefined>(target);

  useEffect(() => {
    const from = current.current;
    if (from === undefined || target === undefined || from === target || prefersReducedMotion()) {
      current.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const value = Math.round(from + (target - from) * (1 - Math.pow(1 - t, 4)));
      current.current = value;
      setShown(value as T);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);

  // Until the effect catches up with a first known value, show it rather than nothing.
  return (shown === undefined ? target : shown) as T;
}

/**
 * The value this device last showed under `key`, moving to `value` once `hold`
 * is off - so a gain earned while the player was away plays out in front of
 * them. With no record yet (first visit, no storage) it is just `value`.
 *
 * `scope` (a date, a week) is stored with the value: a record from another scope
 * counts as no record, so a per-day number reuses one key instead of one per day.
 */
export function useCatchUp<T extends number | undefined>(key: string, value: T, hold: boolean, scope = ''): T {
  const storeKey = `cq-seen:${key}`;
  const [seen] = useState(() => {
    const raw = deviceMemory.get(storeKey);
    if (!raw) return undefined;
    const cut = raw.lastIndexOf('|');
    if ((cut === -1 ? '' : raw.slice(0, cut)) !== scope) return undefined;
    const parsed = Number(raw.slice(cut + 1));
    return Number.isFinite(parsed) ? parsed : undefined;
  });
  const [released, setReleased] = useState(false);

  useEffect(() => {
    if (hold || value === undefined) return;
    setReleased(true);
    deviceMemory.set(storeKey, scope ? `${scope}|${value}` : String(value));
  }, [storeKey, value, hold, scope]);

  if (value === undefined) return value;
  return (released || seen === undefined ? value : seen) as T;
}
