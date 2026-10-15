/**
 * Phase 0: what does DeansList actually return for this school? Reports field
 * NAMES and counts only, never a student's values, so the output can be
 * pasted into a chat or an issue. Shared by scripts/discover-deanslist.ts and
 * the `discover` job.
 */
import { DeansListConfig, fetchAttendanceCodes, fetchAttendanceForDay, fetchRosters, fetchStudents } from './client';
import { activeHomeroomNames, guardianEmailsFromStudent, homeroomsFromRosters, marksFromRows } from './normalize';
import { str, truthy } from './types';

export interface DiscoveryReport {
  at: string; // ISO instant the pull ran
  dateKey: string;
  students: { count: number; enrolled: number; fields: string[]; withParentsArray: number; withAnyGuardianEmail: number; withTopLevelEmail: number; withStudentSchoolId: number; parentFields: string[] };
  rosters: { count: number; fields: string[]; homerooms: string[]; homeroomsWithTakeAttendance: number };
  attendance: { count: number; fields: string[]; codesSeen: Record<string, number>; rowsPerHomeroom: Record<string, { enrolled: number; rows: number }>; studentsWithoutHomeroom: number };
  codes: { count: number; fields: string[]; list: { name: string; absentTardy: string; excused: boolean }[] };
}

function fieldNames(rows: Record<string, unknown>[]): string[] {
  const names = new Set<string>();
  for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) names.add(k);
  return Array.from(names).sort();
}

export async function discover(config: DeansListConfig, dateKey: string): Promise<DiscoveryReport> {
  const [students, rosters, attendance, codes] = await Promise.all([
    fetchStudents(config),
    fetchRosters(config),
    fetchAttendanceForDay(config, dateKey),
    fetchAttendanceCodes(config),
  ]);

  const rosterHomerooms = homeroomsFromRosters(rosters);
  const homeroomOf = (s: (typeof students)[number]) => str(s.Homeroom) || rosterHomerooms.get(str(s.StudentID)) || '';
  const enrolledStudents = students.filter((s) => !/not enrolled|withdrawn|inactive/i.test(str(s.EnrollmentStatus)));
  const marks = marksFromRows(attendance, codes);

  const rowsPerHomeroom: Record<string, { enrolled: number; rows: number }> = {};
  let withoutHomeroom = 0;
  for (const s of enrolledStudents) {
    const h = homeroomOf(s);
    if (!h) {
      withoutHomeroom++;
      continue;
    }
    const e = (rowsPerHomeroom[h] ??= { enrolled: 0, rows: 0 });
    e.enrolled++;
    if (marks.has(str(s.StudentID))) e.rows++;
  }
  const codesSeen: Record<string, number> = {};
  for (const m of marks.values()) codesSeen[m.code] = (codesSeen[m.code] ?? 0) + 1;

  const parentFields = new Set<string>();
  for (const s of students) for (const p of s.Parents ?? []) if (p) for (const k of Object.keys(p)) parentFields.add(k);

  return {
    at: new Date().toISOString(),
    dateKey,
    students: {
      count: students.length,
      enrolled: enrolledStudents.length,
      fields: fieldNames(students as Record<string, unknown>[]),
      withParentsArray: students.filter((s) => Array.isArray(s.Parents) && s.Parents.length > 0).length,
      withAnyGuardianEmail: students.filter((s) => guardianEmailsFromStudent(s).length > 0).length,
      withTopLevelEmail: students.filter((s) => str(s.Email).includes('@')).length,
      withStudentSchoolId: students.filter((s) => str(s.StudentSchoolID)).length,
      parentFields: Array.from(parentFields).sort(),
    },
    rosters: {
      count: rosters.length,
      fields: fieldNames(rosters as Record<string, unknown>[]),
      homerooms: activeHomeroomNames(rosters),
      homeroomsWithTakeAttendance: rosters.filter((r) => str(r.RosterType) === 'Homeroom' && truthy(r.TakeAttendance)).length,
    },
    attendance: {
      count: attendance.length,
      fields: fieldNames(attendance as Record<string, unknown>[]),
      codesSeen,
      rowsPerHomeroom,
      studentsWithoutHomeroom: withoutHomeroom,
    },
    codes: {
      count: codes.length,
      fields: fieldNames(codes as Record<string, unknown>[]),
      list: codes.map((c) => ({ name: str(c.ActionName), absentTardy: str(c.AbsentTardy), excused: truthy(c.IsExcused) })),
    },
  };
}

/** Human-readable version for the terminal and for Slack. */
export function formatDiscovery(r: DiscoveryReport): string {
  const lines: string[] = [];
  lines.push(`DeansList discovery for ${r.dateKey} at ${r.at}`);
  lines.push('');
  lines.push(`students: ${r.students.count} (${r.students.enrolled} enrolled); with Local ID: ${r.students.withStudentSchoolId}`);
  lines.push(`  guardian emails: ${r.students.withAnyGuardianEmail} students have one via Parents[]; ${r.students.withParentsArray} have a Parents array; ${r.students.withTopLevelEmail} have a top-level Email`);
  lines.push(`  fields: ${r.students.fields.join(', ')}`);
  if (r.students.parentFields.length) lines.push(`  parent fields: ${r.students.parentFields.join(', ')}`);
  lines.push('');
  lines.push(`rosters: ${r.rosters.count}; homerooms: ${r.rosters.homerooms.join(', ') || '(none)'}; with TakeAttendance: ${r.rosters.homeroomsWithTakeAttendance}`);
  lines.push(`  fields: ${r.rosters.fields.join(', ')}`);
  lines.push('');
  lines.push(`attendance rows today: ${r.attendance.count}; students without a homeroom: ${r.attendance.studentsWithoutHomeroom}`);
  lines.push(`  fields: ${r.attendance.fields.join(', ')}`);
  lines.push(`  codes seen: ${Object.entries(r.attendance.codesSeen).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}`);
  lines.push('  rows per homeroom (rows/enrolled):');
  for (const [h, v] of Object.entries(r.attendance.rowsPerHomeroom).sort()) lines.push(`    ${h}: ${v.rows}/${v.enrolled}`);
  lines.push('');
  lines.push(`attendance codes: ${r.codes.count}`);
  for (const c of r.codes.list) lines.push(`    ${c.name} -> ${c.absentTardy || '?'}${c.excused ? ' (excused)' : ''}`);
  return lines.join('\n');
}
