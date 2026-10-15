/**
 * Database tables. Every mutation the app makes is a single statement, so the
 * Neon HTTP driver (no transactions) is enough. See docs/DECISIONS.md.
 */
import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';

/** DeansList roster, refreshed every morning. The kiosk searches this table, never the API. */
export const studentsCache = pgTable('students_cache', {
  dlStudentId: text('dl_student_id').primaryKey(),
  studentSchoolId: text('student_school_id'), // "Local ID" in OnCourse
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  preferredName: text('preferred_name'),
  grade: text('grade'),
  homeroom: text('homeroom'),
  guardianEmails: jsonb('guardian_emails').$type<string[]>().notNull().default([]),
  enrolled: boolean('enrolled').notNull().default(true),
  enrollmentStatus: text('enrollment_status'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Guardian emails uploaded as a CSV (OnCourse export) when DeansList has none; an upload wins over the API. */
export const guardianContacts = pgTable('guardian_contacts', {
  studentSchoolId: text('student_school_id').primaryKey(),
  emails: jsonb('emails').$type<string[]>().notNull().default([]),
  uploadedBy: text('uploaded_by'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Slack user id per staff email, resolved during the roster refresh (users.lookupByEmail is rate limited). */
export const staff = pgTable('staff', {
  email: text('email').primaryKey(),
  slackUserId: text('slack_user_id'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  error: text('error'),
});

/** One row per homeroom per school day: what the 9:10 and 9:20 jobs saw and did. */
export const homeroomStatus = pgTable(
  'homeroom_status',
  {
    runDate: date('run_date').notNull(),
    homeroom: text('homeroom').notNull(),
    teacherEmails: jsonb('teacher_emails').$type<string[]>().notNull().default([]),
    enrolled: integer('enrolled').notNull().default(0),
    rowsSeen: integer('rows_seen').notNull().default(0),
    submittedSeenAt: timestamp('submitted_seen_at', { withTimezone: true }),
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    remindError: text('remind_error'),
    escalateError: text('escalate_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runDate, t.homeroom] })]
);

/** A late arrival recorded at the kiosk (or by an admin). Undo keeps the row and sets undone_at. */
export const checkins = pgTable(
  'checkins',
  {
    id: serial('id').primaryKey(),
    runDate: date('run_date').notNull(),
    dlStudentId: text('dl_student_id').notNull(),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull().defaultNow(),
    source: text('source').$type<'kiosk' | 'admin'>().notNull().default('kiosk'),
    slackChannel: text('slack_channel'),
    slackTs: text('slack_ts'),
    slackError: text('slack_error'),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
    undoneBy: text('undone_by'),
  },
  (t) => [
    // One active check-in per student per day; a double tap hits this and is answered "already checked in".
    uniqueIndex('checkins_active_unique').on(t.runDate, t.dlStudentId).where(sql`${t.undoneAt} IS NULL`),
    index('checkins_run_date_idx').on(t.runDate),
  ]
);

/** Parent emails: the 10:00 absence notice and the reversal after a later check-in. The unique index is the send claim. */
export const parentNotices = pgTable(
  'parent_notices',
  {
    id: serial('id').primaryKey(),
    runDate: date('run_date').notNull(),
    dlStudentId: text('dl_student_id').notNull(),
    kind: text('kind').$type<'absent' | 'reversal'>().notNull(),
    status: text('status').$type<'pending' | 'sent' | 'failed'>().notNull().default('pending'),
    toEmails: jsonb('to_emails').$type<string[]>().notNull().default([]),
    gmailMessageIds: jsonb('gmail_message_ids').$type<string[]>().notNull().default([]),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('parent_notices_unique').on(t.runDate, t.dlStudentId, t.kind), index('parent_notices_run_date_idx').on(t.runDate)]
);

/** Every job invocation. The partial unique index on status='running' is the soft lock against overlapping runs. */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: serial('id').primaryKey(),
    job: text('job').notNull(),
    runDate: date('run_date').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: text('status').$type<'running' | 'ok' | 'error' | 'skipped'>().notNull().default('running'),
    dryRun: boolean('dry_run').notNull().default(true),
    triggeredBy: text('triggered_by'),
    summary: jsonb('summary').$type<Record<string, unknown>>(),
    error: text('error'),
  },
  (t) => [uniqueIndex('job_runs_running_unique').on(t.job, t.runDate).where(sql`${t.status} = 'running'`), index('job_runs_run_date_idx').on(t.runDate)]
);

/** Paired kiosk devices. Only the SHA-256 of the token is stored. */
export const kioskDevices = pgTable('kiosk_devices', {
  id: serial('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  label: text('label').notNull(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export type StudentRow = typeof studentsCache.$inferSelect;
export type CheckinRow = typeof checkins.$inferSelect;
export type ParentNoticeRow = typeof parentNotices.$inferSelect;
export type HomeroomStatusRow = typeof homeroomStatus.$inferSelect;
export type JobRunRow = typeof jobRuns.$inferSelect;
