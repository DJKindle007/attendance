/**
 * Rows of the end-of-day tardy spreadsheet. Pure; the xlsx builder and the
 * admin page both consume this.
 */
import type { CachedStudent, StudentMark } from '@/lib/deanslist/normalize';
import { formatStudentName } from '@/lib/deanslist/normalize';
import { formatTime } from '@/lib/time';

export interface CheckinLike {
  dlStudentId: string;
  checkedInAt: Date;
  undoneAt: Date | null;
}

export interface TardyRow {
  lastName: string;
  firstName: string;
  name: string;
  localId: string; // DeansList StudentSchoolID, the OnCourse Local ID
  grade: string;
  homeroom: string;
  arrivedAt: Date;
  arrivedAtText: string;
  deansListMark: string; // the DeansList code at report time, blank when none
}

export function tardyRows(
  checkins: CheckinLike[],
  students: Map<string, CachedStudent>,
  marks: Map<string, StudentMark> | undefined,
  tz?: string
): TardyRow[] {
  const rows: TardyRow[] = [];
  for (const c of checkins) {
    if (c.undoneAt) continue;
    const s = students.get(c.dlStudentId);
    if (!s) continue;
    rows.push({
      lastName: s.lastName,
      firstName: s.preferredName ? `${s.firstName} (${s.preferredName})` : s.firstName,
      name: formatStudentName(s),
      localId: s.studentSchoolId ?? '',
      grade: s.grade ?? '',
      homeroom: s.homeroom ?? '',
      arrivedAt: c.checkedInAt,
      arrivedAtText: formatTime(c.checkedInAt, tz),
      deansListMark: marks?.get(c.dlStudentId)?.code ?? '',
    });
  }
  const gradeNum = (g: string) => Number(g.replace(/\D/g, '')) || 0;
  return rows.sort(
    (a, b) => gradeNum(a.grade) - gradeNum(b.grade) || a.homeroom.localeCompare(b.homeroom) || a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  );
}
