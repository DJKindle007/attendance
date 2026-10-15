// Google sign-in restricted to the school's Workspace domain, for the admin
// pages only. Sessions are JWT-based (no database). AUTH_DISABLED=true
// bypasses auth in local development only; it is ignored in production
// builds and on Vercel. Same setup as deanslist-dashboard.
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'kindleeducation.org').toLowerCase();

export const authDisabled =
  process.env.AUTH_DISABLED === 'true' && process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: '/signin' },
  callbacks: {
    signIn({ profile }) {
      const email = (profile?.email ?? '').toLowerCase();
      return Boolean(profile?.email_verified) && email.endsWith(`@${allowedDomain}`);
    },
    authorized({ auth }) {
      return authDisabled || Boolean(auth?.user);
    },
  },
});

/** Email of the signed-in admin, or "dev" when auth is disabled locally. */
export async function currentAdminEmail(): Promise<string | null> {
  if (authDisabled) return 'dev@local';
  const session = await auth();
  return session?.user?.email?.toLowerCase() ?? null;
}
