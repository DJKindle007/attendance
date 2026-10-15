/** Phase 0 discovery as a job, so it can run on Vercel with the real key. Field names and counts only. */
import 'server-only';
import { requireDeansListConfig } from '@/lib/deanslist/client';
import { discover, formatDiscovery } from '@/lib/deanslist/discover';
import type { JobContext, JobSummary } from './run';

export async function discoverJob(ctx: JobContext): Promise<JobSummary> {
  const report = await discover(requireDeansListConfig(), ctx.runDate);
  return { text: formatDiscovery(report), report };
}
