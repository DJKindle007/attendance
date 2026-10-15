/** 9:20 AM: email a written warning to teachers still missing, and DM the operations coordinator the list. */
import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { schoolConfig } from '@/lib/config';
import { missingHomerooms, unconfiguredHomerooms } from '@/lib/domain/attendance';
import { teacherWarning } from '@/lib/email-templates';
import { sendMail } from '@/lib/gmail';
import { dm } from '@/lib/slack';
import type { JobContext, JobSummary } from './run';
import { coverageFor, loadMarks, loadStudents, opsSlackId, recordCoverage, teacherDisplayName } from './shared';

export async function escalateTeachers(ctx: JobContext): Promise<JobSummary> {
  const students = await loadStudents();
  if (!students.length) throw new Error('The roster cache is empty; run refresh-roster first.');
  const { marks, rows } = await loadMarks(ctx.runDate);
  const coverage = coverageFor(students, marks);
  await recordCoverage(ctx.runDate, coverage, ctx.now);

  const cfg = schoolConfig();
  const missing = missingHomerooms(coverage);
  const escalated: string[] = [];
  const alreadyEscalated: string[] = [];
  const failed: { homeroom: string; error: string }[] = [];

  for (const c of missing) {
    const claimed = await db()
      .update(schema.homeroomStatus)
      .set({ escalatedAt: ctx.now, escalateError: null })
      .where(and(eq(schema.homeroomStatus.runDate, ctx.runDate), eq(schema.homeroomStatus.homeroom, c.homeroom), isNull(schema.homeroomStatus.escalatedAt)))
      .returning();
    if (!claimed[0]) {
      alreadyEscalated.push(c.homeroom);
      continue;
    }
    const errors: string[] = [];
    for (const email of c.teachers) {
      const content = teacherWarning({ teacherName: teacherDisplayName(email), homeroom: c.homeroom, dateKey: ctx.runDate, deadline: cfg.attendanceDeadline, schoolName: cfg.schoolName, opsEmail: cfg.opsCoordinatorEmail });
      const res = await sendMail({ to: [email], cc: [cfg.opsCoordinatorEmail], replyTo: cfg.opsCoordinatorEmail, content });
      if (!res.ok) errors.push(`${email}: ${res.error}`);
    }
    if (errors.length === c.teachers.length) {
      await db()
        .update(schema.homeroomStatus)
        .set({ escalatedAt: null, escalateError: errors.join('; ').slice(0, 1000) })
        .where(and(eq(schema.homeroomStatus.runDate, ctx.runDate), eq(schema.homeroomStatus.homeroom, c.homeroom)));
      failed.push({ homeroom: c.homeroom, error: errors.join('; ') });
    } else {
      escalated.push(c.homeroom);
    }
  }

  const unconfigured = unconfiguredHomerooms(coverage);
  let opsMessage: string | null = null;
  if (missing.length || unconfigured.length) {
    const lines = missing.map((c) => `• *${c.homeroom}*: ${c.teachers.map(teacherDisplayName).join(', ')} (${c.rowsSeen}/${c.enrolled} marked)`);
    if (unconfigured.length) lines.push(`• Not in config/homerooms.json, nobody reminded: ${unconfigured.map((c) => c.homeroom).join(', ')}`);
    opsMessage = `:rotating_light: Attendance still missing after ${cfg.attendanceDeadline} today. Warning emails ${ctx.dryRun ? 'would be' : 'were'} sent. Please track these down:\n${lines.join('\n')}`;
    const ops = await opsSlackId();
    if (ops) await dm(ops, opsMessage);
    else console.warn('ops coordinator has no Slack id; escalation list not delivered');
  }

  return {
    attendanceRows: rows,
    missing: missing.map((c) => `${c.homeroom} (${c.rowsSeen}/${c.enrolled})`),
    escalated,
    alreadyEscalated,
    failed,
    unconfigured: unconfigured.map((c) => c.homeroom),
    opsNotified: Boolean(opsMessage),
  };
}
