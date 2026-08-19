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

/**
 * Everything below works on YYYY-MM-DD household dates rather than instants.
 *
 * The arithmetic runs in UTC on purpose. These are calendar dates, not moments:
 * "the day after 2026-03-08" is 2026-03-09 regardless of the fact that the day
 * between them was 23 hours long in Chicago. Doing this in a local timezone is
 * how the day after a spring-forward Sunday becomes the same Sunday again.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isHouseholdDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  // Rejects 2026-02-30, which the pattern alone happily accepts.
  return toUtc(value).toISOString().slice(0, 10) === value;
}

function toUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

export function addHouseholdDays(date: string, delta: number): string {
  const shifted = toUtc(date);
  shifted.setUTCDate(shifted.getUTCDate() + delta);
  return shifted.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function householdDaysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/**
 * ISO weekday for a household date: 1 = Monday .. 7 = Sunday, matching the
 * `days_of_week` values stored on chore_schedules.
 */
export function isoWeekdayFor(date: string): number {
  const day = toUtc(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the household week a date falls in, for the weekly cash-out cap. */
export function householdWeekStart(date: string): string {
  return addHouseholdDays(date, -(isoWeekdayFor(date) - 1));
}
