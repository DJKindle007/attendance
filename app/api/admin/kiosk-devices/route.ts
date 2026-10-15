import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { currentAdminEmail } from '@/auth';
import { db, schema } from '@/db/client';
import { hashToken, newToken } from '@/lib/kiosk-auth';

export const dynamic = 'force-dynamic';

/** POST { label } : creates a kiosk pairing link (shown once). DELETE { id } : revokes a device. */
export async function POST(request: NextRequest) {
  const email = await currentAdminEmail();
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { label?: string };
  const label = String(body.label ?? '').trim().slice(0, 80) || 'Front desk';
  const token = newToken();
  await db().insert(schema.kioskDevices).values({ tokenHash: hashToken(token), label, createdBy: email });
  const base = process.env.APP_URL || request.nextUrl.origin;
  return NextResponse.json({ label, pairUrl: `${base}/kiosk/pair?token=${token}` });
}

export async function DELETE(request: NextRequest) {
  const email = await currentAdminEmail();
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: number };
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await db().update(schema.kioskDevices).set({ revokedAt: new Date() }).where(eq(schema.kioskDevices.id, id));
  return NextResponse.json({ ok: true });
}
