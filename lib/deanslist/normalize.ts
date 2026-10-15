/**
 * Pure mapping from DeansList rows to the app's shapes. No fetch, no storage,
 * so the same code runs in jobs, scripts and the check script.
 */
import { AttendanceStatus, DLAttendanceCode, DLAttendanceRow, DLRoster, DLStudent, str, truthy } from './types';

const ATTENDANCE_STATUS_BY_LETTER: Record<string, AttendanceStatus> = {
  P: 'present',
  A: 'absent',
  T: 'tardy',
  D: 'half-day',
  I: 'iss',
  O: 'oss',
};

export interface AttendanceCodeRule {
  status: AttendanceStatus;
  excused: boolean;
  known: boolean; // false when the code was not in DeansList's list and the rule was inferred from its name
}

/** Rules keyed by code name from v1/daily-attendance/codes. */
export function attendanceCodeRules(codes: DLAttendanceCode[] | undefined): Map<string, AttendanceCodeRule> {
  const rules = new Map<string, AttendanceCodeRule>();
  for (const c of codes ?? []) {
    const name = str(c.ActionName);
    if (!name) continue;
    rules.set(name, {
      status: ATTENDANCE_STATUS_BY_LETTER[str(c.AbsentTardy).toUpperCase()] ?? 'other',
      excused: truthy(c.IsExcused),
      known: true,
    });
  }
  return rules;
}

/** A code missing from the code list is read from its name. */
export function inferAttendanceRule(code: string): AttendanceCodeRule {
  const lower = code.toLowerCase();
  const status: AttendanceStatus = /oss/.test(lower)
    ? 'oss'
    : /absent/.test(lower)
      ? 'absent'
      : /tardy|late/.test(lower)
        ? 'tardy'
        : /half/.test(lower)
          ? 'half-day'
          : /iss/.test(lower)
            ? 'iss'
            : /present/.test(lower)
              ? 'present'
              : 'other';
  return { status, excused: /excused|medical|religious/.test(lower) && !/unexcused/.test(lower), known: false };
}

export function statusForCode(code: string, rules: Map<string, AttendanceCodeRule>): AttendanceCodeRule {
  return rules.get(code) ?? inferAttendanceRule(code);
}

/** Student id -> homeroom name from active Homeroom-type rosters (rosters with "test" in the name are ignored). */
export function homeroomsFromRosters(rosters: DLRoster[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rosters ?? []) {
    if (str(r.RosterType) !== 'Homeroom' || !truthy(r.Active ?? 'Y')) continue;
    const name = str(r.RosterName);
    if (!name || /test/i.test(name)) continue;
    for (const id of str(r.StudentIDs).split(',')) {
      const key = id.trim();
      if (key && !map.has(key)) map.set(key, name);
    }
  }
  return map;
}

/** Names of active Homeroom-type rosters, for comparing against config/homerooms.json. */
export function activeHomeroomNames(rosters: DLRoster[] | undefined): string[] {
  const names = new Set<string>();
  for (const r of rosters ?? []) {
    if (str(r.RosterType) !== 'Homeroom' || !truthy(r.Active ?? 'Y')) continue;
    const name = str(r.RosterName);
    if (name && !/test/i.test(name)) names.add(name);
  }
  return Array.from(names).sort();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Guardian emails from a student row: every parent marked Guardian (or every parent when none is marked), deduped, lowercased. */
export function guardianEmailsFromStudent(row: DLStudent): string[] {
  const parents = (row.Parents ?? []).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const guardians = parents.filter((p) => truthy(p.Guardian));
  const source = guardians.length ? guardians : parents;
  const emails = new Set<string>();
  for (const p of source) {
    const e = str(p.Email).toLowerCase();
    if (EMAIL_RE.test(e)) emails.add(e);
  }
  return Array.from(emails);
}

export interface CachedStudent {
  dlStudentId: string;
  studentSchoolId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  grade: string | null;
  homeroom: string | null;
  guardianEmails: string[];
  enrolled: boolean;
  enrollmentStatus: string | null;
}

/** v1/students rows -> cache rows. Homeroom comes from the Homeroom field, else from a Homeroom roster. */
export function normalizeStudents(students: DLStudent[], rosters: DLRoster[] | undefined): CachedStudent[] {
  const rosterHomerooms = homeroomsFromRosters(rosters);
  const out: CachedStudent[] = [];
  for (const row of students) {
    const id = str(row.StudentID);
    if (!id) continue;
    const status = str(row.EnrollmentStatus) || null;
    out.push({
      dlStudentId: id,
      studentSchoolId: str(row.StudentSchoolID) || null,
      firstName: str(row.FirstName),
      lastName: str(row.LastName),
      preferredName: str(row.PreferredName) || null,
      grade: str(row.GradeLevelShort) || str(row.GradeLevel) || null,
      homeroom: str(row.Homeroom) || rosterHomerooms.get(id) || null,
      guardianEmails: guardianEmailsFromStudent(row),
      enrolled: status === null ? true : !/not enrolled|withdrawn|inactive/i.test(status),
      enrollmentStatus: status,
    });
  }
  return out;
}

export interface StudentMark {
  dlStudentId: string;
  code: string;
  status: AttendanceStatus;
  excused: boolean;
  known: boolean;
}

/** Today's rows -> one mark per student (the last row wins if DeansList ever returns two). */
export function marksFromRows(rows: DLAttendanceRow[], codes: DLAttendanceCode[] | undefined): Map<string, StudentMark> {
  const rules = attendanceCodeRules(codes);
  const marks = new Map<string, StudentMark>();
  for (const r of rows) {
    const id = str(r.DLStudentID);
    const code = str(r.Behavior);
    if (!id || !code) continue;
    const rule = statusForCode(code, rules);
    marks.set(id, { dlStudentId: id, code, status: rule.status, excused: rule.excused, known: rule.known });
  }
  return marks;
}

export function formatStudentName(s: { firstName: string; lastName: string; preferredName?: string | null }): string {
  const first = s.preferredName || s.firstName;
  return [first, s.lastName].filter(Boolean).join(' ');
}
