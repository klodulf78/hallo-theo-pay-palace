// German Werktage (working days) helpers.
//
// Werktag = Monday through Friday. Saturday and Sunday are excluded.
// National holidays are NOT modeled — declared demo simplification per spec.
//
// All inputs/outputs are calendar dates (year-month-day). To avoid timezone
// surprises we treat dates as UTC y/m/d triplets — no time-of-day.

export type DateInput = Date | string;

function toUtcDate(input: DateInput): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  // Accept ISO "YYYY-MM-DD" or full ISO strings.
  const [y, m, d] = input.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isWorkingDay(date: DateInput): boolean {
  const day = toUtcDate(date).getUTCDay(); // 0=Sun, 6=Sat
  return day !== 0 && day !== 6;
}

/**
 * Add `n` working days to `date`. If the start date is not a working day,
 * the count begins on the next working day. n=0 returns the start date itself
 * (clamped to the next working day if it falls on a weekend).
 *
 * Examples:
 *   addWorkingDays('2026-05-04', 1)  // Mon → Tue
 *   addWorkingDays('2026-05-08', 1)  // Fri → Mon (skips weekend)
 *   addWorkingDays('2026-05-09', 1)  // Sat → Tue (Sat→Mon for n=0, then +1)
 */
export function addWorkingDays(date: DateInput, n: number): Date {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`addWorkingDays: n must be a non-negative integer, got ${n}`);
  }
  const cursor = toUtcDate(date);
  // Normalize: if start is a weekend, jump to next working day first.
  while (!isWorkingDay(cursor)) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  let remaining = n;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkingDay(cursor)) remaining--;
  }
  return cursor;
}

/**
 * Inclusive-exclusive count of working days in [a, b). If b <= a returns 0.
 * Used for default-days math and deadline-passed checks.
 */
export function workingDaysBetween(a: DateInput, b: DateInput): number {
  const start = toUtcDate(a);
  const end = toUtcDate(b);
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    if (isWorkingDay(cursor)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Returns the date of the Nth working day in the given calendar month.
 * Used to fall back to § 556b BGB (3rd working day) when a tenant has no
 * contractual due_day, and to compute the contractual deadline from due_day.
 */
export function nthWorkingDayOfMonth(year: number, month1: number, n: number): Date {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`nthWorkingDayOfMonth: n must be >= 1, got ${n}`);
  }
  const cursor = new Date(Date.UTC(year, month1 - 1, 1));
  let seen = 0;
  while (true) {
    if (isWorkingDay(cursor)) {
      seen++;
      if (seen === n) return cursor;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCMonth() !== month1 - 1) {
      throw new Error(
        `nthWorkingDayOfMonth: month ${year}-${month1} has fewer than ${n} working days`,
      );
    }
  }
}

/**
 * Format a Date as ISO "YYYY-MM-DD" (UTC). Convenience for writing back to
 * Postgres `date` columns.
 */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
