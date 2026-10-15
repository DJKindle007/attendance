/**
 * DeansList API row shapes, only the fields this app reads. Copied from
 * deanslist-dashboard/lib/data/deanslist.ts and extended with the guardian
 * fields from the public TEAMSchools DeansList schema (Parents[], Email).
 * Phase 0 (scripts/discover-deanslist.ts) confirms which of these the
 * school's account actually returns.
 */

export interface DLParent {
  FirstName?: string | null;
  LastName?: string | null;
  Email?: string | null;
  Relationship?: string | null;
  Guardian?: boolean | string | null;
  ReceivesMail?: boolean | string | null;
  [key: string]: unknown;
}

export interface DLStudent {
  StudentID?: string | number | null;
  StudentSchoolID?: string | null; // the school's own student number ("Local ID")
  FirstName?: string | null;
  LastName?: string | null;
  PreferredName?: string | null;
  GradeLevel?: string | null;
  GradeLevelShort?: string | null;
  Homeroom?: string | null;
  EnrollmentStatus?: string | null;
  Email?: string | null; // student or primary contact email, varies by school
  Parents?: (DLParent | null)[] | null;
  [key: string]: unknown;
}

export interface DLRoster {
  RosterID?: string | number | null;
  RosterName?: string | null;
  RosterType?: string | null;
  Active?: string | boolean | null;
  StudentIDs?: string | null; // comma-separated DeansList student ids
  GradeLevels?: string | null;
  TakeAttendance?: boolean | string | null;
  [key: string]: unknown;
}

/** v1/daily-attendance: one row per student per school day. */
export interface DLAttendanceRow {
  DLSAID?: string | number;
  DLStudentID?: string | number;
  BehaviorDate?: string;
  Behavior?: string; // the attendance code name, e.g. "Present", "Absent - Unexcused"
  BehaviorCategory?: string; // "Daily Attendance"
  [key: string]: unknown;
}

/** v1/daily-attendance/codes: how DeansList counts each code. */
export interface DLAttendanceCode {
  ActionID?: string | number;
  ActionName?: string;
  Weight?: string | number;
  WeightDenominator?: string | number;
  AbsentTardy?: string; // rolled-up status: P present, A absent, T tardy, D half day, I ISS, O OSS
  IsExcused?: boolean | string;
  [key: string]: unknown;
}

export type AttendanceStatus = 'present' | 'absent' | 'tardy' | 'half-day' | 'iss' | 'oss' | 'other';

export function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function truthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = str(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'y' || s === 'yes';
}
