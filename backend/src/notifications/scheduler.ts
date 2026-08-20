import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { Env } from '../env.js';
import { sweepReminders } from './service.js';
import { drainPushQueue } from './push.js';
import { backupIfDue } from '../backup/service.js';
import { renewIfDue } from '../tls/certificate.js';

/**
 * Runs the reminder sweep and the push drain on a timer.
 *
 * Both are reconciliations - they ask what should have been sent by now, not
 * what just happened - so a tick that is late, early, or missed entirely changes
 * only when a notification arrives. That is what makes a restart at 9:20pm still
 * deliver the 8:45pm reminder, and what stops a Windows update at 8:44pm from
 * swallowing a whole evening.
 *
 * The interval carried no correctness argument until push arrived, and it still
 * carries none - but it is now the ceiling on how long a phone waits after a
 * reminder is written, which is the first time the number has meant anything to
 * anybody. Fifteen seconds is chosen for that and nothing else; the sweep is a
 * handful of indexed queries against a household-sized database.
 *
 * The nightly backup rides the same tick and is written the same way: it asks
 * whether today already has one rather than whether 3am has just struck, so a
 * laptop that was restarting at 3am gets its backup at 3:15 and a laptop that
 * was off all night gets one when it comes back.
 */
const TICK_MS = 15_000;

export interface Scheduler {
  stop: () => void;
  /** Runs one sweep and one drain immediately. Used at startup and by tests. */
  runNow: () => Promise<void>;
}

export function startScheduler(
  db: pg.Pool,
  env: Env,
  log: FastifyBaseLogger,
): Scheduler {
  let running = false;

  const tick = async () => {
    // A sweep that overruns its interval must not stack up behind itself.
    if (running) return;
    running = true;
    try {
      const result = await sweepReminders(db, env.HOUSEHOLD_TZ);
      if (result.reminders > 0 || result.escalations > 0) {
        log.info(result, 'reminders sent');
      }
    } catch (error) {
      // A failed sweep is not worth taking the server down for; the next tick
      // reconsiders the same state from scratch.
      log.error({ err: error }, 'reminder sweep failed');
    }

    try {
      // Separately guarded: a sweep that failed still leaves earlier
      // notifications waiting on a phone, and they are not its fault.
      const pushed = await drainPushQueue(db, env, log);
      if (pushed.sent > 0 || pushed.pruned > 0) {
        log.info(pushed, 'push notifications sent');
      }
    } catch (error) {
      log.error({ err: error }, 'push drain failed');
    }

    try {
      // Separately guarded again. A backup is the slowest thing on this tick by
      // a wide margin, and a household must not lose its evening reminders
      // because pg_dump had a bad night.
      const backup = await backupIfDue(db, env, log);
      if (backup) {
        log.info(
          { bytes: backup.bytes, photos: backup.photoCount, mirrored: backup.mirroredTo !== null },
          'nightly backup taken',
        );
      }
    } catch (error) {
      log.error({ err: error }, 'nightly backup failed');
    }

    try {
      // Guarded separately again, and it matters most here: a certificate has
      // thirty days of slack by the time this starts trying, so a failure is
      // something to log and retry tomorrow rather than anything to interrupt
      // an evening's reminders over.
      if (await renewIfDue(env, log)) {
        log.warn(
          'certificate renewed - restart the server to serve it, until then the old one is still in use',
        );
      }
    } catch (error) {
      log.error({ err: error }, 'certificate renewal failed');
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
