'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import {
  loginAction,
  signupAction,
  forgotAction,
  resetAction,
} from '../../lib/auth/actions';
import type { AuthMode, FormState } from '../../lib/auth/validation';
import { Button } from '../ui/button';

const actions = {
  login: loginAction,
  signup: signupAction,
  forgot: forgotAction,
  reset: resetAction,
};
const labels = {
  login: 'Sign in',
  signup: 'Create account',
  forgot: 'Send reset link',
  reset: 'Update password',
};
export function AuthForm({
  mode,
  unavailable,
}: {
  mode: AuthMode;
  unavailable: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    actions[mode],
    {},
  );
  return (
    <form action={action} className="mt-7 space-y-5" aria-busy={pending}>
      {mode !== 'reset' && (
        <label className="form-label">
          Email address
          <input
            className="form-input"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            disabled={pending || unavailable}
          />
        </label>
      )}
      {mode !== 'forgot' && (
        <label className="form-label">
          {mode === 'reset' ? 'New password' : 'Password'}
          <input
            className="form-input"
            name="password"
            type="password"
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
            minLength={mode === 'login' ? 1 : 12}
            maxLength={128}
            required
            disabled={pending || unavailable}
            aria-describedby={
              mode === 'login' ? undefined : 'password-guidance'
            }
          />
        </label>
      )}
      {(mode === 'signup' || mode === 'reset') && (
        <>
          <p id="password-guidance" className="text-xs text-muted-foreground">
            Use 12–128 characters. A unique passphrase is a good choice.
          </p>
          <label className="form-label">
            Confirm password
            <input
              className="form-input"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              disabled={pending || unavailable}
            />
          </label>
        </>
      )}
      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm"
        >
          {state.error}
        </p>
      )}
      {state.message && (
        <p
          role="status"
          className="rounded-md border border-success/30 bg-success/10 p-3 text-sm"
        >
          {state.message}
        </p>
      )}
      <Button className="w-full" disabled={pending || unavailable}>
        {pending ? 'Please wait…' : labels[mode]}
      </Button>
      <div className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
        {mode === 'login' ? (
          <>
            <Link className="underline" href="/signup">
              Create an account
            </Link>
            <Link className="underline" href="/forgot-password">
              Forgot password?
            </Link>
          </>
        ) : (
          <Link className="underline" href="/login">
            Back to sign in
          </Link>
        )}
      </div>
    </form>
  );
}
