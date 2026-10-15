/** Name search over the roster cache, shared by the kiosk and the admin page. Returns names and homerooms only. */
import 'server-only';
import { and, eq, ilike, or } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export interface StudentMatch {
  id: string;
  name: string;
  homeroom: string;
  grade: string;
}

export async function searchStudents(query: string, limit = 8): Promise<StudentMatch[]> {
  const q = query.trim().replace(/[%_]/g, '');
  if (q.length < 2) return [];
  const [first, last] = q.split(/\s+/);
  const s = schema.studentsCache;
  const nameMatch = last
    ? or(and(ilike(s.firstName, `${first}%`), ilike(s.lastName, `${last}%`)), and(ilike(s.preferredName, `${first}%`), ilike(s.lastName, `${last}%`)))
    : or(ilike(s.firstName, `${first}%`), ilike(s.lastName, `${first}%`), ilike(s.preferredName, `${first}%`));
  const rows = await db()
    .select({ id: s.dlStudentId, firstName: s.firstName, lastName: s.lastName, preferredName: s.preferredName, homeroom: s.homeroom, grade: s.grade })
    .from(s)
    .where(and(eq(s.enrolled, true), nameMatch))
    .orderBy(s.lastName, s.firstName)
    .limit(limit);
  return rows.map((r) => ({ id: r.id, name: `${r.preferredName || r.firstName} ${r.lastName}`, homeroom: r.homeroom ?? '', grade: r.grade ?? '' }));
}
