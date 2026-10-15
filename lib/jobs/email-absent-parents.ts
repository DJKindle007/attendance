/** 10:00 AM: email guardians of every student marked absent who has not checked in, then sweep for reversals. */
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { absentStudents } from '@/lib/domain/attendance';
import { guardianUploads, sendAbsenceNotice, sendReversalIfNeeded } from '@/lib/notices';
import { dm } from '@/lib/slack';
import type { JobContext, JobSummary } from './run';
import { activeCheckinIds, coverageFor, loadMarks, loadStudents, opsSlackId } from './shared';

export async function emailAbsentParents(ctx: JobContext): Promise<JobSummary> {
  const students = await loadStudents();
  if (!students.length) throw new Error('The roster cache is empty; run refresh-roster first.');
  const { marks, rows } = await loadMarks(ctx.runDate);
  const coverage = coverageFor(students, marks);
  const checkedIn = await activeCheckinIds(ctx.runDate);
  const decision = absentStudents(students, marks, checkedIn, coverage);
  const uploads = await guardianUploads();

  let sent = 0;
  let already = 0;
  const noContact: string[] = [];
  const failed: string[] = [];
  for (const s of decision.absent) {
    const out = await sendAbsenceNotice(s, ctx.runDate, uploads);
    if (out.result === 'sent') sent++;
    else if (out.result === 'already') already++;
    else if (out.result === 'no-contact') noContact.push(s.dlStudentId);
    else failed.push(`${s.dlStudentId}: ${out.error}`);
  }

  // Sweep: a student who checked in while this job was sending still gets exactly one reversal.
  const byId = new Map(students.map((s) => [s.dlStudentId, s]));
  const activeRows = await db()
    .select()
    .from(schema.checkins)
    .where(and(eq(schema.checkins.runDate, ctx.runDate)));
  let reversals = 0;
  for (const c of activeRows) {
    if (c.undoneAt) continue;
    const s = byId.get(c.dlStudentId);
    if (!s) continue;
    const out = await sendReversalIfNeeded(s, ctx.runDate, c.checkedInAt, uploads);
    if (out?.result === 'sent') reversals++;
  }

  const unsubmitted = coverage.filter((c) => !c.submitted && c.enrolled > 0).map((c) => c.homeroom);
  const ops = await opsSlackId();
  if (ops) {
    const parts = [`:email: Absence emails ${ctx.dryRun ? 'would be ' : ''}sent to families of ${sent} student${sent === 1 ? '' : 's'}.`];
    if (already) parts.push(`${already} already sent earlier.`);
    if (noContact.length) parts.push(`${noContact.length} absent student${noContact.length === 1 ? ' has' : 's have'} no guardian email on file.`);
    if (failed.length) parts.push(`${failed.length} failed to send (see the admin page).`);
    if (decision.unknown.length) parts.push(`${decision.unknown.length} student${decision.unknown.length === 1 ? '' : 's'} in unsubmitted homerooms (${unsubmitted.join(', ')}) were not emailed.`);
    if (reversals) parts.push(`${reversals} arrival follow-up${reversals === 1 ? '' : 's'} sent.`);
    await dm(ops, parts.join(' '));
  }

  return {
    attendanceRows: rows,
    absent: decision.absent.length,
    sent,
    already,
    noContact: noContact.length,
    failed,
    checkedInBeforeEmail: decision.checkedIn.length,
    unknown: decision.unknown.length,
    unsubmittedHomerooms: unsubmitted,
    reversals,
  };
}
