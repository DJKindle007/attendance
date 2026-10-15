/** Data access the jobs share: the roster cache, today's marks, check-ins, and the ops coordinator's Slack id. */
import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { env, schoolConfig } from '@/lib/config';
import { fetchAttendanceCodes, fetchAttendanceForDay, requireDeansListConfig } from '@/lib/deanslist/client';
import { marksFromRows, type CachedStudent, type StudentMark } from '@/lib/deanslist/normalize';
import { homeroomCoverage, type HomeroomCoverage } from '@/lib/domain/attendance';
import { slackIdFor } from '@/lib/staff';

export async function loadStudents(): Promise<CachedStudent[]> {
  const rows = await db().select().from(schema.studentsCache);
  return rows.map((r) => ({
    dlStudentId: r.dlStudentId,
    studentSchoolId: r.studentSchoolId,
    firstName: r.firstName,
    lastName: r.lastName,
    preferredName: r.preferredName,
    grade: r.grade,
    homeroom: r.homeroom,
    guardianEmails: r.guardianEmails ?? [],
    enrolled: r.enrolled,
    enrollmentStatus: r.enrollmentStatus,
  }));
}

export async function loadMarks(runDate: string): Promise<{ marks: Map<string, StudentMark>; rows: number }> {
  const config = requireDeansListConfig();
  const [rows, codes] = await Promise.all([fetchAttendanceForDay(config, runDate), fetchAttendanceCodes(config)]);
  return { marks: marksFromRows(rows, codes), rows: rows.length };
}

export async function activeCheckinIds(runDate: string): Promise<Set<string>> {
  const rows = await db()
    .select({ id: schema.checkins.dlStudentId })
    .from(schema.checkins)
    .where(and(eq(schema.checkins.runDate, runDate), isNull(schema.checkins.undoneAt)));
  return new Set(rows.map((r) => r.id));
}

export function coverageFor(students: CachedStudent[], marks: Map<string, StudentMark>): HomeroomCoverage[] {
  return homeroomCoverage(students, marks, schoolConfig(), env().HOMEROOM_SUBMITTED_MIN_RATIO);
}

/** Writes what this pull saw for every homeroom, without touching the reminded/escalated claims. */
export async function recordCoverage(runDate: string, coverage: HomeroomCoverage[], now: Date): Promise<void> {
  for (const c of coverage) {
    if (!c.configured) continue;
    await db()
      .insert(schema.homeroomStatus)
      .values({ runDate, homeroom: c.homeroom, teacherEmails: c.teachers, enrolled: c.enrolled, rowsSeen: c.rowsSeen, submittedSeenAt: c.submitted ? now : null, updatedAt: now })
      .onConflictDoUpdate({
        target: [schema.homeroomStatus.runDate, schema.homeroomStatus.homeroom],
        set: {
          teacherEmails: c.teachers,
          enrolled: c.enrolled,
          rowsSeen: c.rowsSeen,
          updatedAt: now,
        },
      });
    if (c.submitted) {
      await db()
        .update(schema.homeroomStatus)
        .set({ submittedSeenAt: now })
        .where(and(eq(schema.homeroomStatus.runDate, runDate), eq(schema.homeroomStatus.homeroom, c.homeroom), isNull(schema.homeroomStatus.submittedSeenAt)));
    }
  }
}

export async function opsSlackId(): Promise<string | null> {
  return slackIdFor(schoolConfig().opsCoordinatorEmail);
}

export function teacherDisplayName(email: string): string {
  const local = email.split('@')[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}
