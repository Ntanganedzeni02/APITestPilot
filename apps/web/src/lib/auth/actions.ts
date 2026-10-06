'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authClient } from './server';
import { ConfigurationError, readAuthConfig } from './config';
import { validateAuthInput, type AuthMode, type FormState } from './validation';

async function submit(mode: AuthMode, form: FormData): Promise<FormState> {
  let input;
  try {
    input = validateAuthInput(mode, form);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Check your details.',
    };
  }
  let destination: string | undefined;
  try {
    const config = readAuthConfig(process.env);
    const client = await authClient();
    if (mode === 'login') {
      const { error } = await client.auth.signInWithPassword(input);
      if (error)
        return {
          error:
            'Unable to sign in. Check your email and password, and verify your email if required.',
        };
      destination = '/onboarding';
    } else if (mode === 'signup') {
      const { data, error } = await client.auth.signUp({
        ...input,
        options: { emailRedirectTo: `${config.origin}/auth/callback` },
      });
      if (error)
        return {
          error:
            error.code === 'user_already_exists'
              ? 'An account with this email already exists. Sign in or reset your password.'
              : 'Unable to create an account. Check your details or try signing in or resetting your password.',
        };
      if (data.session) destination = '/onboarding';
      else
        return {
          message:
            'If this email is already registered, sign in or reset your password. Otherwise, check your email for a confirmation link to complete signup.',
        };
    } else if (mode === 'forgot') {
      const { error } = await client.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${config.origin}/auth/callback?next=/reset-password`,
      });
      if (error)
        return {
          error: 'Unable to send a reset link right now. Please try again.',
        };
      return {
        message:
          'If an account exists for this email, you will receive a password reset link.',
      };
    } else {
      const { data, error: userError } = await client.auth.getUser();
      if (userError || !data.user)
        return {
          error: 'This reset link is invalid or expired. Request a new link.',
        };
      const { error } = await client.auth.updateUser({
        password: input.password,
      });
      if (error)
        return {
          error:
            'Unable to reset your password. Request a new link or choose another password.',
        };
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError)
        return {
          message:
            'Your password was updated. Please sign out before signing in again.',
        };
      destination = '/login?notice=password-updated';
    }
  } catch (error) {
    return {
      error:
        error instanceof ConfigurationError
          ? error.message
          : 'Authentication is temporarily unavailable. Please try again.',
    };
  }
  if (destination) {
    const jar = await cookies();
    jar.delete('tp-workspace');
    jar.delete('tp-project');
    redirect(destination);
  }
  return {};
}
export async function loginAction(_state: FormState, form: FormData) {
  return submit('login', form);
}
export async function signupAction(_state: FormState, form: FormData) {
  return submit('signup', form);
}
export async function forgotAction(_state: FormState, form: FormData) {
  return submit('forgot', form);
}
export async function resetAction(_state: FormState, form: FormData) {
  return submit('reset', form);
}
export async function signOutAction() {
  const client = await authClient();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) redirect('/login?notice=signout-failed');
  const jar = await cookies();
  jar.delete('tp-workspace');
  jar.delete('tp-project');
  redirect('/login?notice=signed-out');
}
