import { NextRequest, NextResponse } from 'next/server';
import { dbNotConfiguredResponse } from '@/lib/db-guard';
import { currentAdminEmail } from '@/auth';
import { undoCheckin } from '@/lib/checkin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const noDb = dbNotConfiguredResponse();
  if (noDb) return noDb;
  const email = await currentAdminEmail();
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: number };
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const result = await undoCheckin(id, email);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
