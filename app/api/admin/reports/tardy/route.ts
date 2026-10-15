import { NextRequest, NextResponse } from 'next/server';
import { dbNotConfiguredResponse } from '@/lib/db-guard';
import { currentAdminEmail } from '@/auth';
import { tardyRowsForDate } from '@/lib/jobs/tardy-report';
import { todayKey } from '@/lib/time';
import { buildTardyXlsx, tardyFileName } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

/** GET /api/admin/reports/tardy?date=YYYY-MM-DD : the spreadsheet, regenerated from the database. */
export async function GET(request: NextRequest) {
  const noDb = dbNotConfiguredResponse();
  if (noDb) return noDb;
  if (!(await currentAdminEmail())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = request.nextUrl.searchParams.get('date');
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayKey();
  const rows = await tardyRowsForDate(date, request.nextUrl.searchParams.get('marks') !== '0');
  const file = await buildTardyXlsx(rows, date);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${tardyFileName(date)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
