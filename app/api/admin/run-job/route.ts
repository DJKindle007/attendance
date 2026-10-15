import { NextRequest, NextResponse } from 'next/server';
import { dbNotConfiguredResponse } from '@/lib/db-guard';
import { currentAdminEmail } from '@/auth';
import { JOBS } from '@/lib/jobs';
import { runJob } from '@/lib/jobs/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/admin/run-job { job, force?, date? } : the "Run now" button. */
export async function POST(request: NextRequest) {
  const noDb = dbNotConfiguredResponse();
  if (noDb) return noDb;
  const email = await currentAdminEmail();
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { job?: string; force?: boolean; date?: string };
  const job = body.job ? JOBS[body.job] : undefined;
  if (!job || !body.job) return NextResponse.json({ error: 'unknown job' }, { status: 404 });
  const runDate = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : undefined;
  const outcome = await runJob(body.job, job.fn, { triggeredBy: `admin:${email}`, force: body.force, runDate });
  return NextResponse.json(outcome, { status: outcome.status === 'busy' ? 409 : 200 });
}
