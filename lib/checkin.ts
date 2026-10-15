/**
 * A late arrival: record it once, tell the grade team on Slack, and send the
 * parent reversal when an absence email already went out. Used by the kiosk
 * and the admin page.
 */
import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { schoolConfig } from '@/lib/config';
import { formatStudentName, type CachedStudent } from '@/lib/deanslist/normalize';
import { guardianUploads, sendReversalIfNeeded, type NoticeOutcome } from '@/lib/notices';
import { postMessage, updateMessage } from '@/lib/slack';
import { formatTime, todayKey } from '@/lib/time';

export interface CheckinResult {
  ok: true;
  alreadyCheckedIn: boolean;
  checkinId: number;
  studentName: string;
  homeroom: string | null;
  checkedInAt: Date;
  checkedInAtText: string;
  slack?: { ok: boolean; error?: string };
  reversal?: NoticeOutcome | null;
}

export async function findStudent(dlStudentId: string): Promise<CachedStudent | null> {
  const rows = await db().select().from(schema.studentsCache).where(eq(schema.studentsCache.dlStudentId, dlStudentId)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return { ...r, guardianEmails: r.guardianEmails ?? [] };
}

export function latePassText(student: CachedStudent, at: Date): string {
  return `:alarm_clock: Late pass: *${formatStudentName(student)}* (${student.homeroom ?? 'no homeroom'}) arrived at ${formatTime(at)}.`;
}

export async function checkInStudent(student: CachedStudent, source: 'kiosk' | 'admin', now: Date = new Date()): Promise<CheckinResult> {
  const runDate = todayKey(now);
  const inserted = await db()
    .insert(schema.checkins)
    .values({ runDate, dlStudentId: student.dlStudentId, checkedInAt: now, source })
    .onConflictDoNothing({ target: [schema.checkins.runDate, schema.checkins.dlStudentId], where: sql`undone_at IS NULL` })
    .returning();
  const studentName = formatStudentName(student);

  if (!inserted[0]) {
    const existing = await db()
      .select()
      .from(schema.checkins)
      .where(and(eq(schema.checkins.runDate, runDate), eq(schema.checkins.dlStudentId, student.dlStudentId), isNull(schema.checkins.undoneAt)))
      .limit(1);
    const at = existing[0]?.checkedInAt ?? now;
    return { ok: true, alreadyCheckedIn: true, checkinId: existing[0]?.id ?? 0, studentName, homeroom: student.homeroom, checkedInAt: at, checkedInAtText: formatTime(at) };
  }
  const row = inserted[0];

  // Late pass to the grade channel. A Slack failure never undoes the check-in.
  const cfg = schoolConfig();
  const channel = student.grade ? cfg.gradeChannels[student.grade] : undefined;
  let slack: CheckinResult['slack'];
  if (channel) {
    const res = await postMessage(channel, latePassText(student, now));
    slack = { ok: res.ok, error: res.error };
    await db()
      .update(schema.checkins)
      .set({ slackChannel: res.channel ?? channel, slackTs: res.ts ?? null, slackError: res.ok ? null : (res.error ?? 'unknown') })
      .where(eq(schema.checkins.id, row.id));
  } else {
    slack = { ok: false, error: `no Slack channel configured for grade "${student.grade ?? ''}"` };
    await db().update(schema.checkins).set({ slackError: slack.error }).where(eq(schema.checkins.id, row.id));
  }

  const reversal = await sendReversalIfNeeded(student, runDate, now, await guardianUploads());

  return { ok: true, alreadyCheckedIn: false, checkinId: row.id, studentName, homeroom: student.homeroom, checkedInAt: now, checkedInAtText: formatTime(now), slack, reversal };
}

export async function undoCheckin(checkinId: number, by: string): Promise<{ ok: boolean; reversalAlreadySent: boolean; error?: string }> {
  const rows = await db().select().from(schema.checkins).where(eq(schema.checkins.id, checkinId)).limit(1);
  const row = rows[0];
  if (!row) return { ok: false, reversalAlreadySent: false, error: 'not found' };
  if (row.undoneAt) return { ok: true, reversalAlreadySent: false };
  await db().update(schema.checkins).set({ undoneAt: new Date(), undoneBy: by }).where(eq(schema.checkins.id, checkinId));
  if (row.slackChannel && row.slackTs) {
    const student = await findStudent(row.dlStudentId);
    const name = student ? formatStudentName(student) : row.dlStudentId;
    await updateMessage(row.slackChannel, row.slackTs, `~Late pass: ${name}~ (cancelled by the office)`);
  }
  const notices = await db()
    .select()
    .from(schema.parentNotices)
    .where(and(eq(schema.parentNotices.runDate, row.runDate), eq(schema.parentNotices.dlStudentId, row.dlStudentId), eq(schema.parentNotices.kind, 'reversal')));
  return { ok: true, reversalAlreadySent: notices.some((n) => n.status === 'sent') };
}
