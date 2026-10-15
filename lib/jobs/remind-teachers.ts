/** 9:10 AM: Slack-DM every homeroom teacher whose homeroom has not been submitted. */
import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { schoolConfig } from '@/lib/config';
import { missingHomerooms, unconfiguredHomerooms } from '@/lib/domain/attendance';
import { resolveSlackIds } from '@/lib/staff';
import { dm } from '@/lib/slack';
import { formatLongDate } from '@/lib/time';
import type { JobContext, JobSummary } from './run';
import { coverageFor, loadMarks, loadStudents, recordCoverage, teacherDisplayName } from './shared';

export async function remindTeachers(ctx: JobContext): Promise<JobSummary> {
  const students = await loadStudents();
  if (!students.length) throw new Error('The roster cache is empty; run refresh-roster first.');
  const { marks, rows } = await loadMarks(ctx.runDate);
  const coverage = coverageFor(students, marks);
  await recordCoverage(ctx.runDate, coverage, ctx.now);

  const missing = missingHomerooms(coverage);
  const ids = await resolveSlackIds(missing.flatMap((c) => c.teachers));
  const cfg = schoolConfig();
  const reminded: string[] = [];
  const alreadyReminded: string[] = [];
  const failed: { homeroom: string; error: string }[] = [];

  for (const c of missing) {
    const claimed = await db()
      .update(schema.homeroomStatus)
      .set({ remindedAt: ctx.now, remindError: null })
      .where(and(eq(schema.homeroomStatus.runDate, ctx.runDate), eq(schema.homeroomStatus.homeroom, c.homeroom), isNull(schema.homeroomStatus.remindedAt)))
      .returning();
    if (!claimed[0]) {
      alreadyReminded.push(c.homeroom);
      continue;
    }
    const errors: string[] = [];
    for (const email of c.teachers) {
      const id = ids.get(email);
      if (!id) {
        errors.push(`${email}: not on Slack`);
        continue;
      }
      const text =
        `:clipboard: Hi ${teacherDisplayName(email)}, attendance for *${c.homeroom}* has not been submitted in OnCourse for ${formatLongDate(ctx.runDate)}. ` +
        `It is due by ${cfg.attendanceDeadline}. Please submit it now. (${c.rowsSeen} of ${c.enrolled} students have a mark so far.)`;
      const res = await dm(id, text);
      if (!res.ok) errors.push(`${email}: ${res.error}`);
    }
    if (errors.length === c.teachers.length) {
      // Nobody was reached: release the claim so the next run tries again.
      await db()
        .update(schema.homeroomStatus)
        .set({ remindedAt: null, remindError: errors.join('; ').slice(0, 1000) })
        .where(and(eq(schema.homeroomStatus.runDate, ctx.runDate), eq(schema.homeroomStatus.homeroom, c.homeroom)));
      failed.push({ homeroom: c.homeroom, error: errors.join('; ') });
    } else {
      if (errors.length) await db().update(schema.homeroomStatus).set({ remindError: errors.join('; ').slice(0, 1000) }).where(and(eq(schema.homeroomStatus.runDate, ctx.runDate), eq(schema.homeroomStatus.homeroom, c.homeroom)));
      reminded.push(c.homeroom);
    }
  }

  return {
    attendanceRows: rows,
    submitted: coverage.filter((c) => c.configured && c.submitted && c.enrolled > 0).map((c) => c.homeroom),
    missing: missing.map((c) => `${c.homeroom} (${c.rowsSeen}/${c.enrolled})`),
    reminded,
    alreadyReminded,
    failed,
    unconfigured: unconfiguredHomerooms(coverage).map((c) => c.homeroom),
  };
}
