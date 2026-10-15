/**
 * Runs one job with the guards every job needs: a soft lock so overlapping
 * invocations (Cloud Scheduler retry, admin "Run now") do not both send, the
 * school-day gate, DRY_RUN, and a job_runs row with a summary or an error.
 */
import 'server-only';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { isDryRun } from '@/lib/config';
import { isSchoolDay, todayKey } from '@/lib/time';

export interface JobContext {
  runDate: string; // YYYY-MM-DD in the school's time zone
  now: Date;
  dryRun: boolean;
  force: boolean;
  triggeredBy: string;
}

export type JobSummary = Record<string, unknown>;
export type JobFn = (ctx: JobContext) => Promise<JobSummary>;

export interface JobOutcome {
  job: string;
  runDate: string;
  status: 'ok' | 'error' | 'skipped' | 'busy';
  dryRun: boolean;
  summary?: JobSummary;
  error?: string;
  runId?: number;
}

/** Jobs that never send anything and may run on any day. */
const ALWAYS_RUN = new Set(['discover', 'refresh-roster']);

const STALE_LOCK_MS = 90_000;

export async function runJob(name: string, fn: JobFn, opts: { triggeredBy: string; force?: boolean; now?: Date; runDate?: string }): Promise<JobOutcome> {
  const now = opts.now ?? new Date();
  const runDate = opts.runDate ?? todayKey(now);
  const dryRun = isDryRun();
  const force = Boolean(opts.force);
  const base = { job: name, runDate, dryRun };

  if (!force && !ALWAYS_RUN.has(name) && !isSchoolDay(runDate)) {
    await db().insert(schema.jobRuns).values({ job: name, runDate, status: 'skipped', dryRun, triggeredBy: opts.triggeredBy, finishedAt: now, summary: { reason: 'not a school day' } });
    return { ...base, status: 'skipped', summary: { reason: 'not a school day' } };
  }

  // Reclaim a lock left behind by a crashed run.
  await db()
    .update(schema.jobRuns)
    .set({ status: 'error', error: 'stale lock reclaimed', finishedAt: now })
    .where(and(eq(schema.jobRuns.job, name), eq(schema.jobRuns.runDate, runDate), eq(schema.jobRuns.status, 'running'), lt(schema.jobRuns.startedAt, new Date(now.getTime() - STALE_LOCK_MS))));

  const claimed = await db()
    .insert(schema.jobRuns)
    .values({ job: name, runDate, status: 'running', dryRun, triggeredBy: opts.triggeredBy, startedAt: now })
    .onConflictDoNothing({ target: [schema.jobRuns.job, schema.jobRuns.runDate], where: sql`status = 'running'` })
    .returning({ id: schema.jobRuns.id });
  const runId = claimed[0]?.id;
  if (!runId) return { ...base, status: 'busy', error: 'another run of this job is in progress' };

  try {
    const summary = await fn({ runDate, now, dryRun, force, triggeredBy: opts.triggeredBy });
    await db().update(schema.jobRuns).set({ status: 'ok', finishedAt: new Date(), summary }).where(eq(schema.jobRuns.id, runId));
    return { ...base, status: 'ok', summary, runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`job ${name} failed:`, message);
    await db().update(schema.jobRuns).set({ status: 'error', finishedAt: new Date(), error: message.slice(0, 1000) }).where(eq(schema.jobRuns.id, runId));
    return { ...base, status: 'error', error: message, runId };
  }
}
