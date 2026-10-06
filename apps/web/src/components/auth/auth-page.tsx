import { readAuthConfig } from '../../lib/auth/config';
import { authClient } from '../../lib/auth/server';
import type { AuthMode } from '../../lib/auth/validation';
import { AuthForm } from './auth-form';

const copy = {
  login: [
    'Welcome back.',
    'Sign in to your workspace and continue building an evidence trail.',
  ],
  signup: [
    'Give your API a home.',
    'Create your account, then set up your workspace and first project.',
  ],
  forgot: [
    'Reset your password.',
    'Enter your email and we’ll send instructions if an account exists.',
  ],
  reset: [
    'Choose a new password.',
    'Set a unique password to secure your TestPilot account.',
  ],
};
const notices: Record<string, string> = {
  'signed-out': 'You have signed out.',
  'signout-failed': 'Sign out could not be completed. Please try again.',
  'session-unavailable':
    'Your session could not be verified. Please sign in again or retry shortly.',
  'password-updated':
    'Your password was updated. Sign in with your new password.',
  'invalid-link':
    'This link is invalid or expired. Request a new verification or password reset email.',
};
export async function AuthPage({
  mode,
  searchParams,
}: {
  mode: AuthMode;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let unavailable = false;
  try {
    readAuthConfig(process.env);
  } catch {
    unavailable = true;
  }
  let invalidReset = false;
  if (mode === 'reset' && !unavailable) {
    try {
      const client = await authClient();
      const { data, error } = await client.auth.getUser();
      invalidReset = !!error || !data.user;
    } catch {
      invalidReset = true;
    }
  }
  const query = await searchParams;
  const notice =
    typeof query['notice'] === 'string' ? notices[query['notice']] : undefined;
  return (
    <>
      <p className="eyebrow">Your evidence starts here</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {copy[mode][0]}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {copy[mode][1]}
      </p>
      {unavailable && (
        <p
          role="status"
          className="mt-5 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm"
        >
          Authentication is not configured. Follow the Supabase setup guide to
          enable sign in.
        </p>
      )}
      {notice && (
        <p role="status" className="mt-5 text-sm">
          {notice}
        </p>
      )}
      {invalidReset && (
        <p role="alert" className="mt-5 text-sm">
          This reset link is invalid or expired. Request a new link from Forgot
          password.
        </p>
      )}
      <AuthForm mode={mode} unavailable={unavailable || invalidReset} />
    </>
  );
}
