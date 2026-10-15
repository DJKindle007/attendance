import { NextRequest, NextResponse } from 'next/server';
import { currentAdminEmail } from '@/auth';
import { checkInStudent, findStudent } from '@/lib/checkin';

export const dynamic = 'force-dynamic';

/** POST /api/admin/checkin { dlStudentId } : the office checks a student in by hand. */
export async function POST(request: NextRequest) {
  if (!(await currentAdminEmail())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { dlStudentId?: string };
  const student = await findStudent(String(body.dlStudentId ?? ''));
  if (!student || !student.enrolled) return NextResponse.json({ error: 'student not found' }, { status: 404 });
  const result = await checkInStudent(student, 'admin');
  return NextResponse.json(result);
}
