/**
 * School-local dates. The server runs in UTC (Vercel), so "today" is always
 * derived in the school's time zone, never from a bare Date.
 *
 * The SCHOOL_YEARS list is copied from deanslist-dashboard's schoolCalendar.ts
 * (SY26-27 from the KEPCS calendar). Update it each year.
 */
import { formatInTimeZone } from 'date-fns-tz';

export interface SchoolYear {
  firstDay: string; // YYYY-MM-DD
  lastDay: string; // YYYY-MM-DD
  noSchool: string[]; // YYYY-MM-DD, weekdays with no students
}

export const SCHOOL_YEARS: SchoolYear[] = [
  {
    firstDay: '2026-09-08',
    lastDay: '2027-06-25',
    noSchool: [
      '2026-10-12', // Indigenous People's Day
      '2026-11-11', // Veterans Day observed
      '2026-11-26', // Thanksgiving
      '2026-11-27',
      '2026-12-21', // Winter recess 12/21-1/4
      '2026-12-22',
      '2026-12-23',
      '2026-12-24',
      '2026-12-25',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-04', // Staff PD, no students
      '2027-01-18', // MLK Day
      '2027-02-15', // Presidents' Day
      '2027-03-26', // Spring recess 3/26-4/2
      '2027-03-29',
      '2027-03-30',
      '2027-03-31',
      '2027-04-01',
      '2027-04-02',
      '2027-04-05', // Staff PD, no students
      '2027-05-31', // Memorial Day
      '2027-06-18', // Juneteenth observed
    ],
  },
];

const NO_SCHOOL = new Set(SCHOOL_YEARS.flatMap((y) => y.noSchool));

export const DEFAULT_TZ = 'America/New_York';

export function schoolTz(): string {
  return process.env.TZ_NAME || DEFAULT_TZ;
}

/** YYYY-MM-DD for an instant, in the school's time zone. */
export function dateKeyInTz(instant: Date, tz: string = schoolTz()): string {
  return formatInTimeZone(instant, tz, 'yyyy-MM-dd');
}

/** Today's YYYY-MM-DD in the school's time zone. */
export function todayKey(now: Date = new Date(), tz: string = schoolTz()): string {
  return dateKeyInTz(now, tz);
}

/** "8:47 AM" in the school's time zone. */
export function formatTime(instant: Date, tz: string = schoolTz()): string {
  return formatInTimeZone(instant, tz, 'h:mm a');
}

/** "Thursday, October 15, 2026" in the school's time zone. */
export function formatLongDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  // Noon UTC keeps the calendar date stable in every US zone.
  return formatInTimeZone(new Date(Date.UTC(y, m - 1, d, 12)), 'UTC', 'EEEE, MMMM d, yyyy');
}

/** Day of week for a YYYY-MM-DD key, 0 = Sunday, computed without any time zone. */
export function dayOfWeek(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function inSchoolYear(key: string): boolean {
  return SCHOOL_YEARS.some((y) => key >= y.firstDay && key <= y.lastDay);
}

/** Monday to Friday, inside a configured school year, and not a day off. */
export function isSchoolDay(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const dow = dayOfWeek(dateKey);
  return dow >= 1 && dow <= 5 && inSchoolYear(dateKey) && !NO_SCHOOL.has(dateKey);
}
