import { NextRequest, NextResponse } from 'next/server';
import { checkInStudent, findStudent } from '@/lib/checkin';
import { currentKioskDevice } from '@/lib/kiosk-auth';

export const dynamic = 'force-dynamic';

/** POST /api/kiosk/checkin { dlStudentId } */
export async function POST(request: NextRequest) {
  if (!(await currentKioskDevice())) return NextResponse.json({ error: 'kiosk not paired' }, { status: 401 });
  let body: { dlStudentId?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty */
  }
  const id = String(body.dlStudentId ?? '').trim();
  if (!id) return NextResponse.json({ error: 'dlStudentId required' }, { status: 400 });
  const student = await findStudent(id);
  if (!student || !student.enrolled) return NextResponse.json({ error: 'student not found' }, { status: 404 });
  const result = await checkInStudent(student, 'kiosk');
  return NextResponse.json({
    alreadyCheckedIn: result.alreadyCheckedIn,
    studentName: result.studentName,
    homeroom: result.homeroom,
    checkedInAtText: result.checkedInAtText,
  });
}
