/**
 * Parent emails with a database claim before every send, so a retry, a
 * re-run, or the kiosk and the 10:00 job racing each other can never email
 * a family twice.
 */
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { schoolConfig } from '@/lib/config';
import { formatStudentName, type CachedStudent } from '@/lib/deanslist/normalize';
import { guardianEmailsFor } from '@/lib/domain/attendance';
import { parentAbsence, parentReversal, type EmailContent } from '@/lib/email-templates';
import { sendMail } from '@/lib/gmail';
import { formatTime } from '@/lib/time';

export type NoticeKind = 'absent' | 'reversal';

export interface NoticeOutcome {
  dlStudentId: string;
  kind: NoticeKind;
  result: 'sent' | 'failed' | 'already' | 'no-contact';
  to: string[];
  error?: string;
}

export async function guardianUploads(): Promise<Map<string, string[]>> {
  const rows = await db().select().from(schema.guardianContacts);
  return new Map(rows.map((r) => [r.studentSchoolId, r.emails ?? []]));
}

/** Claims the (runDate, student, kind) slot. Returns the row when this call owns the send, null when it was already claimed. */
async function claim(runDate: string, dlStudentId: string, kind: NoticeKind, to: string[]) {
  const inserted = await db()
    .insert(schema.parentNotices)
    .values({ runDate, dlStudentId, kind, status: 'pending', toEmails: to })
    .onConflictDoNothing({ target: [schema.parentNotices.runDate, schema.parentNotices.dlStudentId, schema.parentNotices.kind] })
    .returning();
  if (inserted[0]) return inserted[0];
  // A failed earlier attempt may be retried: take it over.
  const retried = await db()
    .update(schema.parentNotices)
    .set({ status: 'pending', toEmails: to, error: null })
    .where(and(eq(schema.parentNotices.runDate, runDate), eq(schema.parentNotices.dlStudentId, dlStudentId), eq(schema.parentNotices.kind, kind), eq(schema.parentNotices.status, 'failed')))
    .returning();
  return retried[0] ?? null;
}

async function deliver(noticeId: number, to: string[], content: EmailContent): Promise<{ ok: boolean; error?: string }> {
  const cfg = schoolConfig();
  const ids: string[] = [];
  const errors: string[] = [];
  // One message per guardian address: separated households do not see each other.
  for (const address of to) {
    const res = await sendMail({ to: [address], replyTo: cfg.opsCoordinatorEmail, content });
    if (res.ok) ids.push(res.id ?? '');
    else errors.push(`${address}: ${res.error ?? 'unknown error'}`);
  }
  const ok = errors.length === 0;
  await db()
    .update(schema.parentNotices)
    .set({ status: ok ? 'sent' : 'failed', sentAt: ok ? new Date() : null, gmailMessageIds: ids, error: ok ? null : errors.join('; ').slice(0, 1000) })
    .where(eq(schema.parentNotices.id, noticeId));
  return { ok, error: ok ? undefined : errors.join('; ') };
}

/** The 10:00 absence email for one student. */
export async function sendAbsenceNotice(student: CachedStudent, runDate: string, uploads: Map<string, string[]>): Promise<NoticeOutcome> {
  const to = guardianEmailsFor(student, uploads);
  const base = { dlStudentId: student.dlStudentId, kind: 'absent' as const, to };
  if (!to.length) return { ...base, result: 'no-contact' };
  const row = await claim(runDate, student.dlStudentId, 'absent', to);
  if (!row) return { ...base, result: 'already' };
  const cfg = schoolConfig();
  const content = parentAbsence({ studentName: formatStudentName(student), dateKey: runDate, schoolName: cfg.schoolName, opsEmail: cfg.opsCoordinatorEmail });
  const res = await deliver(row.id, to, content);
  return { ...base, result: res.ok ? 'sent' : 'failed', error: res.error };
}

/** The follow-up when a student checks in after the absence email went out. Only sends when an absence notice exists. */
export async function sendReversalIfNeeded(student: CachedStudent, runDate: string, arrivedAt: Date, uploads: Map<string, string[]>): Promise<NoticeOutcome | null> {
  const existing = await db()
    .select()
    .from(schema.parentNotices)
    .where(and(eq(schema.parentNotices.runDate, runDate), eq(schema.parentNotices.dlStudentId, student.dlStudentId)));
  const absent = existing.find((n) => n.kind === 'absent');
  if (!absent) return null;
  if (existing.some((n) => n.kind === 'reversal' && n.status !== 'failed')) {
    return { dlStudentId: student.dlStudentId, kind: 'reversal', result: 'already', to: [] };
  }
  const to = absent.toEmails?.length ? absent.toEmails : guardianEmailsFor(student, uploads);
  const base = { dlStudentId: student.dlStudentId, kind: 'reversal' as const, to };
  if (!to.length) return { ...base, result: 'no-contact' };
  const row = await claim(runDate, student.dlStudentId, 'reversal', to);
  if (!row) return { ...base, result: 'already' };
  const cfg = schoolConfig();
  const content = parentReversal({ studentName: formatStudentName(student), dateKey: runDate, arrivedAt: formatTime(arrivedAt), schoolName: cfg.schoolName, opsEmail: cfg.opsCoordinatorEmail });
  const res = await deliver(row.id, to, content);
  return { ...base, result: res.ok ? 'sent' : 'failed', error: res.error };
}
