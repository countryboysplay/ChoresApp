/**
 * Household time helpers.
 *
 * Every scheduling rule in Chore Quest (daily chore boundary, 8:45 PM reminder,
 * 11:00 PM escalation, Sunday cash-out reset, streaks) is calculated in the
 * household IANA timezone, never with a fixed UTC offset, so daylight saving
 * transitions do not shift the rules.
 */

/** Calendar date the household is currently living in, as YYYY-MM-DD. */
export function householdToday(timeZone: string, instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** ISO-ish local wall-clock time, for display and health output. */
export function householdNow(timeZone: string, instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

/** Day of week in the household timezone. 0 = Sunday. */
export function householdWeekday(timeZone: string, instant: Date = new Date()): number {
  const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(instant);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.indexOf(label);
}
