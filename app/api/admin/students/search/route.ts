import { NextRequest, NextResponse } from 'next/server';
import { dbNotConfiguredResponse } from '@/lib/db-guard';
import { currentAdminEmail } from '@/auth';
import { searchStudents } from '@/lib/students';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const noDb = dbNotConfiguredResponse();
  if (noDb) return noDb;
  if (!(await currentAdminEmail())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ students: await searchStudents(request.nextUrl.searchParams.get('q') ?? '', 10) });
}
