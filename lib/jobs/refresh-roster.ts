/** 6:30 AM: refresh the roster cache from DeansList and cache staff Slack ids. Never sends to teachers. */
import 'server-only';
import { eq, notInArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { schoolConfig } from '@/lib/config';
import { fetchRosters, fetchStudents, requireDeansListConfig } from '@/lib/deanslist/client';
import { activeHomeroomNames, normalizeStudents } from '@/lib/deanslist/normalize';
import { resolveSlackIds } from '@/lib/staff';
import { dm } from '@/lib/slack';
import type { JobContext, JobSummary } from './run';
import { opsSlackId } from './shared';

export async function refreshRoster(ctx: JobContext): Promise<JobSummary> {
  const config = requireDeansListConfig();
  const [students, rosters] = await Promise.all([fetchStudents(config), fetchRosters(config)]);
  const cached = normalizeStudents(students, rosters);
  const now = new Date();

  for (const s of cached) {
    await db()
      .insert(schema.studentsCache)
      .values({ ...s, updatedAt: now })
      .onConflictDoUpdate({ target: schema.studentsCache.dlStudentId, set: { ...s, updatedAt: now } });
  }
  // Anyone DeansList no longer returns at all is treated as gone.
  if (cached.length) {
    await db()
      .update(schema.studentsCache)
      .set({ enrolled: false, updatedAt: now })
      .where(notInArray(schema.studentsCache.dlStudentId, cached.map((s) => s.dlStudentId)));
  }

  const school = schoolConfig();
  const configured = new Set(Object.keys(school.homerooms));
  const inDeansList = new Set([...activeHomeroomNames(rosters), ...cached.filter((s) => s.enrolled && s.homeroom).map((s) => s.homeroom!)]);
  const missingFromConfig = Array.from(inDeansList).filter((h) => !configured.has(h)).sort();
  const enrolledByHomeroom = new Map<string, number>();
  for (const s of cached) if (s.enrolled && s.homeroom) enrolledByHomeroom.set(s.homeroom, (enrolledByHomeroom.get(s.homeroom) ?? 0) + 1);
  const emptyInConfig = Array.from(configured).filter((h) => !enrolledByHomeroom.get(h)).sort();
  const noGuardianEmail = cached.filter((s) => s.enrolled && s.guardianEmails.length === 0).length;

  const emails = [school.opsCoordinatorEmail, ...Object.values(school.homerooms).flatMap((h) => h.teachers)];
  const ids = await resolveSlackIds(emails);
  const unresolvedStaff = Array.from(ids.entries())
    .filter(([, id]) => !id)
    .map(([email]) => email);

  const problems: string[] = [];
  if (missingFromConfig.length) problems.push(`Homerooms in DeansList with no teacher in config/homerooms.json: ${missingFromConfig.join(', ')}`);
  if (emptyInConfig.length) problems.push(`Homerooms in config with no enrolled students: ${emptyInConfig.join(', ')}`);
  if (unresolvedStaff.length) problems.push(`Staff emails Slack does not know: ${unresolvedStaff.join(', ')}`);
  if (problems.length) {
    const ops = await opsSlackId();
    if (ops) await dm(ops, `:wrench: Attendance app roster refresh found setup problems:\n• ${problems.join('\n• ')}`);
  }

  return {
    students: cached.length,
    enrolled: cached.filter((s) => s.enrolled).length,
    homerooms: Array.from(inDeansList).sort(),
    missingFromConfig,
    emptyInConfig,
    noGuardianEmail,
    unresolvedStaff,
  };
}

/** Enrolled students whose guardian list is empty, for the admin page. */
export async function studentsWithoutGuardianEmail(): Promise<number> {
  const rows = await db().select({ e: schema.studentsCache.guardianEmails }).from(schema.studentsCache).where(eq(schema.studentsCache.enrolled, true));
  return rows.filter((r) => !(r.e ?? []).length).length;
}
