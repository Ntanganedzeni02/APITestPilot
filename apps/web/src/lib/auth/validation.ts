export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';
export interface FormState {
  error?: string;
  message?: string;
}
export function validateAuthInput(mode: AuthMode, form: FormData) {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (
    mode !== 'reset' &&
    (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    throw new Error('Enter a valid email address.');
  if (
    mode !== 'forgot' &&
    (password.length > 128 || password.length < (mode === 'login' ? 1 : 12))
  )
    throw new Error(
      mode === 'login'
        ? 'Enter your password.'
        : 'Use a password with 12–128 characters.',
    );
  if (
    (mode === 'signup' || mode === 'reset') &&
    password !== form.get('confirmPassword')
  )
    throw new Error('Passwords do not match.');
  return { email, password };
}
