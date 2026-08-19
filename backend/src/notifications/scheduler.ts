import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import { sweepReminders } from './service.js';

/**
 * Runs the reminder sweep on a timer.
 *
 * The interval is deliberately short relative to the times it is watching for.
 * The sweep is a reconciliation - it asks what should have been sent by now, not
 * what happened in the last minute - so a tick that is late, early, or missed
 * entirely changes nothing except when the notification arrives. That is what
 * makes a restart at 9:20pm still deliver the 8:45pm reminder, and what stops a
 * Windows update at 8:44pm from swallowing a whole evening.
 *
 * It also means the interval can be tuned freely without any correctness
 * argument attached to the number.
 */
const TICK_MS = 60_000;

export interface Scheduler {
  stop: () => void;
  /** Runs one sweep immediately. Used at startup and by tests. */
  runNow: () => Promise<void>;
}

export function startScheduler(
  db: pg.Pool,
  timeZone: string,
  log: FastifyBaseLogger,
): Scheduler {
  let running = false;

  const tick = async () => {
    // A sweep that overruns its interval must not stack up behind itself.
    if (running) return;
    running = true;
    try {
      const result = await sweepReminders(db, timeZone);
      if (result.reminders > 0 || result.escalations > 0) {
        log.info(result, 'reminders sent');
      }
    } catch (error) {
      // A failed sweep is not worth taking the server down for; the next tick
      // reconsiders the same state from scratch.
      log.error({ err: error }, 'reminder sweep failed');
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), TICK_MS);
  // Never hold the process open on its own account.
  timer.unref?.();

  return {
    stop: () => clearInterval(timer),
    runNow: tick,
  };
}
