import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { JOBS } from '@/lib/jobs';
import { runJob } from '@/lib/jobs/run';

export const dynamic = 'force-dynamic';
// Vercel Hobby defaults to 10 s; the jobs make a few DeansList calls and up to a few dozen sends.
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

/**
 * POST /api/jobs/<name>  (Authorization: Bearer $JOBS_SECRET)
 * Body (optional JSON): { "force": true } runs on a non-school day; { "date": "YYYY-MM-DD" } runs for another date.
 * Returns 200 with a summary even when some recipients failed (they are in the summary),
 * 503 when DeansList or the database is unreachable, so Cloud Scheduler retries only then.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { job: jobName } = await params;
  const job = JOBS[jobName];
  if (!job) return NextResponse.json({ error: `unknown job "${jobName}"`, jobs: Object.keys(JOBS) }, { status: 404 });

  let body: { force?: boolean; date?: string } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    /* no body */
  }
  const runDate = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : undefined;

  const outcome = await runJob(jobName, job.fn, { triggeredBy: 'scheduler', force: body.force, runDate });
  const status = outcome.status === 'error' ? 503 : outcome.status === 'busy' ? 409 : 200;
  return NextResponse.json(outcome, { status });
}

export async function GET() {
  return NextResponse.json({ jobs: Object.entries(JOBS).map(([name, j]) => ({ name, description: j.description, schedule: j.schedule })) });
}
