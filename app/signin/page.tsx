import Link from 'next/link';
import { authDisabled, signIn } from '@/auth';

export default function SignInPage() {
  if (authDisabled) {
    return (
      <main className="min-h-screen flex items-start justify-center p-8">
        <div className="mt-20 w-full max-w-md panel p-10 text-center">
          <h1 className="text-2xl font-bold">Kindle Attendance</h1>
          <p className="mt-2 mb-6 text-sm text-muted">Sign-in is turned off (AUTH_DISABLED=true), so there is nothing to sign in to.</p>
          <Link className="btn btn-primary no-underline" href="/">
            Open the admin page
          </Link>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen flex items-start justify-center p-8">
      <div className="mt-20 w-full max-w-md panel p-10 text-center">
        <h1 className="text-2xl font-bold">Kindle Attendance</h1>
        <p className="mt-2 mb-6 text-sm text-muted">Sign in with your kindleeducation.org Google account to open the admin page.</p>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/' });
          }}
        >
          <button type="submit" className="btn btn-primary">
            Sign in with Google
          </button>
        </form>
        <p className="mt-8 text-xs text-muted">Late students: the check-in kiosk is at the front desk.</p>
      </div>
    </main>
  );
}
