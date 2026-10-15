import { NextRequest, NextResponse } from 'next/server';
import { currentAdminEmail } from '@/auth';
import { db, schema } from '@/db/client';
import { parseGuardianCsv } from '@/lib/guardian-csv';

export const dynamic = 'force-dynamic';

/** POST multipart/form-data with field "file": upserts guardian_contacts. An uploaded row wins over DeansList for that student. */
export async function POST(request: NextRequest) {
  const email = await currentAdminEmail();
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'file required' }, { status: 400 });
  const parsed = parseGuardianCsv(await file.text());
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const now = new Date();
  for (const [studentSchoolId, emails] of parsed.rows) {
    await db()
      .insert(schema.guardianContacts)
      .values({ studentSchoolId, emails, uploadedBy: email, uploadedAt: now })
      .onConflictDoUpdate({ target: schema.guardianContacts.studentSchoolId, set: { emails, uploadedBy: email, uploadedAt: now } });
  }
  return NextResponse.json({ ok: true, students: parsed.rows.size, skipped: parsed.skipped });
}
