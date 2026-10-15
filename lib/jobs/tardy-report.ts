/** 3:30 PM: the spreadsheet of today's late arrivals, delivered to the operations coordinator on Slack. */
import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { tardyRows, type TardyRow } from '@/lib/domain/report';
import { dm, uploadFileToUser } from '@/lib/slack';
import { formatLongDate } from '@/lib/time';
import { buildTardyXlsx, tardyFileName } from '@/lib/xlsx';
import type { JobContext, JobSummary } from './run';
import { loadMarks, loadStudents, opsSlackId } from './shared';

/** Rows for a date, used by the job and the admin download. Marks are optional so the download works when DeansList is down. */
export async function tardyRowsForDate(runDate: string, withMarks: boolean): Promise<TardyRow[]> {
  const students = await loadStudents();
  const byId = new Map(students.map((s) => [s.dlStudentId, s]));
  const rows = await db().select().from(schema.checkins).where(eq(schema.checkins.runDate, runDate));
  let marks: Awaited<ReturnType<typeof loadMarks>>['marks'] | undefined;
  if (withMarks) {
    try {
      marks = (await loadMarks(runDate)).marks;
    } catch (err) {
      console.warn('tardy report: DeansList marks unavailable:', err instanceof Error ? err.message : err);
    }
  }
  return tardyRows(rows, byId, marks);
}

export async function tardyReport(ctx: JobContext): Promise<JobSummary> {
  const rows = await tardyRowsForDate(ctx.runDate, true);
  const ops = await opsSlackId();
  if (!ops) throw new Error('The operations coordinator has no Slack id; check opsCoordinatorEmail in config/homerooms.json.');
  const date = formatLongDate(ctx.runDate);
  if (!rows.length) {
    await dm(ops, `:white_check_mark: No late check-ins today (${date}). Nothing to correct in OnCourse.`);
    return { rows: 0, delivered: 'message' };
  }
  const file = await buildTardyXlsx(rows, ctx.runDate);
  const res = await uploadFileToUser(ops, file, tardyFileName(ctx.runDate), `:spiral_note_pad: ${rows.length} late arrival${rows.length === 1 ? '' : 's'} today (${date}). Please correct these from Absent to Tardy in OnCourse. Local IDs are in column C.`);
  if (!res.ok) throw new Error(`Slack upload failed: ${res.error}`);
  return { rows: rows.length, delivered: 'file', bytes: file.length };
}
