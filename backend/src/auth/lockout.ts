/**
 * PIN attempt lockout.
 *
 * This, not the KDF, is what makes a 4-digit PIN survive contact with a curious
 * sibling. The whole household shares one public IP and often one wifi network,
 * so limiting by address would either be trivially evaded or lock out everyone
 * at once. Counting is per user.
 *
 * The curve is deliberately gentle at the start. A child mistyping their own
 * PIN twice is the common case and must not cost them anything; someone working
 * through 10,000 combinations should hit an hour-long wall within a minute of
 * trying.
 */

/** Wrong attempts allowed before any delay. */
export const FREE_ATTEMPTS = 4;

const MAX_LOCK_MINUTES = 60;

/**
 * Lock duration after `attempts` consecutive failures, in minutes. Zero means
 * no lock yet.
 *
 *   1-4 -> 0      a mistyped PIN is free
 *     5 -> 1
 *     6 -> 2
 *     7 -> 4      ... doubling ...
 *    11 -> 60     and capped there, so a locked-out child is never stuck
 *                 overnight waiting on a parent
 */
export function lockMinutesFor(attempts: number): number {
  if (attempts <= FREE_ATTEMPTS) return 0;
  const doublings = attempts - FREE_ATTEMPTS - 1;
  return Math.min(2 ** doublings, MAX_LOCK_MINUTES);
}

export function lockedUntil(attempts: number, now: Date): Date | null {
  const minutes = lockMinutesFor(attempts);
  if (minutes === 0) return null;
  return new Date(now.getTime() + minutes * 60_000);
}

export function isLocked(lockedUntilValue: Date | null, now: Date): boolean {
  return lockedUntilValue !== null && lockedUntilValue.getTime() > now.getTime();
}

/** Whole seconds remaining, for the "try again in ..." message. */
export function secondsRemaining(lockedUntilValue: Date, now: Date): number {
  return Math.max(0, Math.ceil((lockedUntilValue.getTime() - now.getTime()) / 1000));
}
