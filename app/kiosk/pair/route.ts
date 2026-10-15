import { NextRequest, NextResponse } from 'next/server';
import { KIOSK_COOKIE, deviceForToken, kioskCookieOptions } from '@/lib/kiosk-auth';

export const dynamic = 'force-dynamic';

/** GET /kiosk/pair?token=... : opened once on the kiosk device from the link the admin page generates. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const device = await deviceForToken(token);
  if (!device) return new NextResponse('This pairing link is not valid. Ask the office for a new one.', { status: 400 });
  const res = NextResponse.redirect(new URL('/kiosk', request.url));
  res.cookies.set(KIOSK_COOKIE, token, kioskCookieOptions());
  return res;
}
