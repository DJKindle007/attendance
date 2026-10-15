import { NextRequest, NextResponse } from 'next/server';
import { dbNotConfiguredResponse } from '@/lib/db-guard';
import { currentKioskDevice } from '@/lib/kiosk-auth';
import { searchStudents } from '@/lib/students';

export const dynamic = 'force-dynamic';

/** GET /api/kiosk/search?q=ad : enrolled students whose first, last or preferred name starts with q. */
export async function GET(request: NextRequest) {
  const noDb = dbNotConfiguredResponse();
  if (noDb) return noDb;
  if (!(await currentKioskDevice())) return NextResponse.json({ error: 'kiosk not paired' }, { status: 401 });
  return NextResponse.json({ students: await searchStudents(request.nextUrl.searchParams.get('q') ?? '') });
}
