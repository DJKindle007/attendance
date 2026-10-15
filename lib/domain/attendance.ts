/**
 * The decisions the jobs make, as pure functions over plain data so they can
 * be checked by scripts/check-attendance.ts without a database or network.
 */
import type { CachedStudent, StudentMark } from '@/lib/deanslist/normalize';
import type { SchoolConfig } from '@/lib/config';

export interface HomeroomCoverage {
  homeroom: string;
  grade: string | null;
  teachers: string[]; // empty when the homeroom is not in config
  configured: boolean;
  enrolled: number;
  rowsSeen: number;
  submitted: boolean;
}

export const DEFAULT_SUBMITTED_MIN_RATIO = 0.5;

/**
 * Per homeroom: how many enrolled students have a mark today, and whether that
 * counts as "submitted". One stray row (ops entering an early arrival) must not
 * mark a homeroom submitted, hence the ratio instead of "any row".
 * Homerooms in config with no students, and homerooms in DeansList that are
 * not in config, are both returned so the jobs can report them.
 */
export function homeroomCoverage(
  students: CachedStudent[],
  marks: Map<string, StudentMark>,
  config: Pick<SchoolConfig, 'homerooms'>,
  minRatio: number = DEFAULT_SUBMITTED_MIN_RATIO
): HomeroomCoverage[] {
  const byHomeroom = new Map<string, { enrolled: number; rowsSeen: number }>();
  for (const name of Object.keys(config.homerooms)) byHomeroom.set(name, { enrolled: 0, rowsSeen: 0 });
  for (const s of students) {
    if (!s.enrolled || !s.homeroom) continue;
    const entry = byHomeroom.get(s.homeroom) ?? { enrolled: 0, rowsSeen: 0 };
    entry.enrolled++;
    if (marks.has(s.dlStudentId)) entry.rowsSeen++;
    byHomeroom.set(s.homeroom, entry);
  }
  const out: HomeroomCoverage[] = [];
  for (const [homeroom, { enrolled, rowsSeen }] of byHomeroom) {
    const cfg = config.homerooms[homeroom];
    const ratio = enrolled ? rowsSeen / enrolled : 0;
    out.push({
      homeroom,
      grade: cfg?.grade ?? gradeFromStudents(students, homeroom),
      teachers: cfg?.teachers ?? [],
      configured: Boolean(cfg),
      enrolled,
      rowsSeen,
      // A homeroom with nobody enrolled has nothing to submit.
      submitted: enrolled === 0 ? true : ratio >= minRatio,
    });
  }
  return out.sort((a, b) => a.homeroom.localeCompare(b.homeroom));
}

function gradeFromStudents(students: CachedStudent[], homeroom: string): string | null {
  const s = students.find((x) => x.homeroom === homeroom && x.grade);
  return s?.grade ?? null;
}

/** Homerooms that still need attendance: configured, with students, not submitted. */
export function missingHomerooms(coverage: HomeroomCoverage[]): HomeroomCoverage[] {
  return coverage.filter((c) => c.configured && c.enrolled > 0 && !c.submitted);
}

/** Homerooms DeansList has that config does not, so nobody would be reminded. */
export function unconfiguredHomerooms(coverage: HomeroomCoverage[]): HomeroomCoverage[] {
  return coverage.filter((c) => !c.configured && c.enrolled > 0);
}

export interface AbsentDecision {
  /** Students to email: enrolled, marked absent, no active check-in. */
  absent: CachedStudent[];
  /** Marked absent but already checked in, so no absence email. */
  checkedIn: CachedStudent[];
  /** Enrolled students in a homeroom that was never submitted: unknown, not absent. */
  unknown: CachedStudent[];
}

/**
 * Who gets the 10:00 absence email. Only a code whose rolled-up status is
 * "absent" counts (tardy, half day, ISS and OSS never do). A student with no
 * mark at all is not absent, just unknown, and is reported instead.
 */
export function absentStudents(
  students: CachedStudent[],
  marks: Map<string, StudentMark>,
  activeCheckinIds: Set<string>,
  coverage: HomeroomCoverage[]
): AbsentDecision {
  const submitted = new Set(coverage.filter((c) => c.submitted).map((c) => c.homeroom));
  const absent: CachedStudent[] = [];
  const checkedIn: CachedStudent[] = [];
  const unknown: CachedStudent[] = [];
  for (const s of students) {
    if (!s.enrolled) continue;
    const mark = marks.get(s.dlStudentId);
    if (!mark) {
      if (s.homeroom && !submitted.has(s.homeroom)) unknown.push(s);
      continue;
    }
    if (mark.status !== 'absent') continue;
    if (activeCheckinIds.has(s.dlStudentId)) checkedIn.push(s);
    else absent.push(s);
  }
  const byName = (a: CachedStudent, b: CachedStudent) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
  return { absent: absent.sort(byName), checkedIn: checkedIn.sort(byName), unknown: unknown.sort(byName) };
}

/**
 * A reversal goes out exactly once when an absence notice exists for the
 * student today and the student has an active check-in. Order does not
 * matter: the kiosk checks this after a check-in and the 10:00 job sweeps
 * for it after sending, so a check-in that lands between the job's
 * snapshot and its send still gets one reversal.
 */
export function needsReversal(args: { absentNoticeExists: boolean; activeCheckin: boolean; reversalExists: boolean }): boolean {
  return args.absentNoticeExists && args.activeCheckin && !args.reversalExists;
}

/** Guardian emails for a student: an uploaded CSV row wins over DeansList, otherwise the API's list. */
export function guardianEmailsFor(student: CachedStudent, uploads: Map<string, string[]>): string[] {
  const uploaded = student.studentSchoolId ? uploads.get(student.studentSchoolId) : undefined;
  const list = uploaded && uploaded.length ? uploaded : student.guardianEmails;
  return Array.from(new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean)));
}
