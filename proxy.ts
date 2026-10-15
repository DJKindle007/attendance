import { NextResponse } from 'next/server';
import { auth, authDisabled } from '@/auth';

// Admin pages and /api/admin/* need a signed-in kindleeducation.org account.
// The kiosk (/kiosk, /api/kiosk/*) uses a device cookie and the job endpoints
// (/api/jobs/*) use a bearer secret, so they are excluded here and check
// their own credentials. (Next 16 calls this file proxy.ts; it is the old middleware.)
const proxy = authDisabled ? () => NextResponse.next() : auth;

export default proxy;

export const config = {
  matcher: ['/((?!api/auth|api/jobs|api/kiosk|kiosk|signin|_next/static|_next/image|favicon.ico).*)'],
};
