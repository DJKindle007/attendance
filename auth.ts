// Google sign-in restricted to the school's Workspace domain, for the admin
// pages only. Sessions are JWT-based (no database).
//
// AUTH_DISABLED=true turns sign-in off everywhere, including Vercel. It exists
// so the app can be previewed before the OAuth client exists, and it must be
// removed before any student data is loaded: the admin page shows a red banner
// while it is on.
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'kindleeducation.org').toLowerCase();

export const authDisabled = process.env.AUTH_DISABLED === 'true';

type NA = ReturnType<typeof NextAuth>;

let handlers: NA['handlers'];
let auth: NA['auth'];
let signIn: NA['signIn'];
let signOut: NA['signOut'];

if (authDisabled) {
  console.warn('AUTH_DISABLED=true: the admin page is open to anyone who can reach this URL. Preview only.');
  const gone = async () => Response.json({ error: 'sign-in is disabled (AUTH_DISABLED=true)' }, { status: 404 });
  handlers = { GET: gone, POST: gone } as unknown as NA['handlers'];
  auth = (async () => null) as unknown as NA['auth'];
  signIn = (async () => undefined) as unknown as NA['signIn'];
  signOut = (async () => undefined) as unknown as NA['signOut'];
} else {
  const na = NextAuth({
    providers: [Google],
    pages: { signIn: '/signin' },
    callbacks: {
      signIn({ profile }) {
        const email = (profile?.email ?? '').toLowerCase();
        return Boolean(profile?.email_verified) && email.endsWith(`@${allowedDomain}`);
      },
      authorized({ auth }) {
        return Boolean(auth?.user);
      },
    },
  });
  handlers = na.handlers;
  auth = na.auth;
  signIn = na.signIn;
  signOut = na.signOut;
}

export { handlers, auth, signIn, signOut };

/** Email of the signed-in admin, or a placeholder when sign-in is disabled. */
export async function currentAdminEmail(): Promise<string | null> {
  if (authDisabled) return 'preview@kindleeducation.org';
  const session = await auth();
  return session?.user?.email?.toLowerCase() ?? null;
}
