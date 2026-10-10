import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  },
  deleteCookie: vi.fn(),
}));
vi.mock('./server', () => ({ authClient: async () => ({ auth: mock.auth }) }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ delete: mock.deleteCookie }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
import {
  loginAction,
  signupAction,
  forgotAction,
  resetAction,
  signOutAction,
} from './actions';
function form(password = 'a-valid-test-passphrase') {
  const data = new FormData();
  data.set('email', 'fixture@example.invalid');
  data.set('password', password);
  data.set('confirmPassword', password);
  return data;
}
describe('auth application flows (provider fixtures, not live authentication)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3000');
    for (const method of Object.values(mock.auth)) method.mockReset();
    mock.deleteCookie.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());
  it('sanitizes invalid credentials and provider outages', async () => {
    mock.auth.signInWithPassword.mockResolvedValue({
      error: new Error('raw provider detail'),
    });
    expect((await loginAction({}, form())).error).toContain('Check your email');
    mock.auth.signInWithPassword.mockRejectedValue(
      new Error('sensitive internals'),
    );
    expect((await loginAction({}, form())).error).toBe(
      'Authentication is temporarily unavailable. Please try again.',
    );
  });
  it('redirects successful sign-in and clears previous-account context', async () => {
    mock.auth.signInWithPassword.mockResolvedValue({ error: null });
    await expect(loginAction({}, form())).rejects.toThrow(
      'REDIRECT:/onboarding',
    );
    expect(mock.deleteCookie).toHaveBeenCalledWith('tp-workspace');
    expect(mock.deleteCookie).toHaveBeenCalledWith('tp-project');
  });
  it('handles signup requiring verification without claiming authentication', async () => {
    mock.auth.signUp.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    expect((await signupAction({}, form())).message).toContain(
      'check your email for a confirmation link',
    );
    expect(mock.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { emailRedirectTo: 'http://127.0.0.1:3000/auth/callback' },
      }),
    );
    expect(mock.deleteCookie).not.toHaveBeenCalled();
  });
  it('explains an explicitly reported existing account without exposing provider details', async () => {
    mock.auth.signUp.mockResolvedValue({
      data: { session: null },
      error: { code: 'user_already_exists', message: 'raw provider detail' },
    });
    expect((await signupAction({}, form())).error).toBe(
      'An account with this email already exists. Sign in or reset your password.',
    );
    expect(mock.deleteCookie).not.toHaveBeenCalled();
  });
  it('supports signup where provider returns a real session', async () => {
    mock.auth.signUp.mockResolvedValue({
      data: { session: { user: { id: 'fixture-user' } } },
      error: null,
    });
    await expect(signupAction({}, form())).rejects.toThrow(
      'REDIRECT:/onboarding',
    );
  });
  it('does not disclose whether an email exists in recovery success feedback', async () => {
    mock.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    expect((await forgotAction({}, form())).message).toBe(
      'If an account exists for this email, you will receive a password reset link.',
    );
    expect(mock.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'fixture@example.invalid',
      {
        redirectTo: 'http://127.0.0.1:3000/auth/callback?next=/reset-password',
      },
    );
  });
  it('prevents password updates without a verified live user', async () => {
    mock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('expired'),
    });
    expect((await resetAction({}, form())).error).toContain(
      'invalid or expired',
    );
    expect(mock.auth.updateUser).not.toHaveBeenCalled();
  });
  it('updates only the authenticated account and signs out after recovery', async () => {
    mock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'fixture-user' } },
      error: null,
    });
    mock.auth.updateUser.mockResolvedValue({ error: null });
    mock.auth.signOut.mockResolvedValue({ error: null });
    await expect(resetAction({}, form())).rejects.toThrow(
      'REDIRECT:/login?notice=password-updated',
    );
    expect(mock.auth.updateUser).toHaveBeenCalledWith({
      password: 'a-valid-test-passphrase',
    });
    expect(mock.auth.signOut).toHaveBeenCalled();
  });
  it('does not call the provider for invalid input', async () => {
    expect((await signupAction({}, form('short'))).error).toContain('12–128');
    expect(mock.auth.signUp).not.toHaveBeenCalled();
  });
  it('reports signout failure and clears context only after success', async () => {
    mock.auth.signOut.mockResolvedValue({ error: new Error('outage') });
    await expect(signOutAction()).rejects.toThrow(
      'REDIRECT:/login?notice=signout-failed',
    );
    expect(mock.deleteCookie).not.toHaveBeenCalled();
    mock.auth.signOut.mockResolvedValue({ error: null });
    await expect(signOutAction()).rejects.toThrow(
      'REDIRECT:/login?notice=signed-out',
    );
    expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mock.deleteCookie).toHaveBeenCalledWith('tp-workspace');
  });
});
