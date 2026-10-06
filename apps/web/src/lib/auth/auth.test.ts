import { describe, expect, it } from 'vitest';
import { readAuthConfig, isPublicPath } from './config';
import { validateAuthInput } from './validation';
const config = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  APP_ORIGIN: 'http://127.0.0.1:3000',
};
describe('auth boundaries', () => {
  it('fails closed for missing/unsafe configuration and privileged keys', () => {
    expect(readAuthConfig(config).origin).toBe('http://127.0.0.1:3000');
    for (const env of [
      {},
      { ...config, APP_ORIGIN: 'http://untrusted.example' },
      { ...config, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' },
      { ...config, APP_ORIGIN: 'https://example.com/redirect' },
      {
        ...config,
        NEXT_PUBLIC_SUPABASE_URL: 'https://user:password@example.com',
      },
    ])
      expect(() => readAuthConfig(env)).toThrow(
        'Authentication is not configured',
      );
    const privileged = `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`;
    expect(() =>
      readAuthConfig({
        ...config,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: privileged,
      }),
    ).toThrow();
  });
  it('limits public routes to exact authentication paths', () => {
    for (const path of [
      '/',
      '/projects',
      '/projects/new',
      '/onboarding',
      '/workspaces/new',
      '/settings',
      '/login/forged',
    ])
      expect(isPublicPath(path)).toBe(false);
    for (const path of [
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/auth/confirm',
      '/auth/callback',
    ])
      expect(isPublicPath(path)).toBe(true);
  });
  it('validates email, password length and confirmation without altering passwords', () => {
    const form = new FormData();
    form.set('email', 'person@example.com');
    form.set('password', ' a-long-passphrase ');
    form.set('confirmPassword', ' a-long-passphrase ');
    expect(validateAuthInput('signup', form).password).toBe(
      ' a-long-passphrase ',
    );
    form.set('confirmPassword', 'different');
    expect(() => validateAuthInput('signup', form)).toThrow(
      'Passwords do not match',
    );
    form.set('password', 'short');
    expect(() => validateAuthInput('reset', form)).toThrow('12–128');
    form.set('email', 'bad-email');
    expect(() => validateAuthInput('forgot', form)).toThrow('email');
  });
});
