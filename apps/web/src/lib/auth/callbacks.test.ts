import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
vi.mock('./server', () => ({ authClient: async () => ({ auth: mock }) }));
import { GET as confirm } from '../../app/auth/confirm/route';
import { GET as callback } from '../../app/auth/callback/route';
describe('verification callbacks (provider fixtures)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3000');
    mock.verifyOtp.mockReset();
    mock.exchangeCodeForSession.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());
  it('accepts verified signup and recovery only into fixed routes', async () => {
    mock.verifyOtp.mockResolvedValue({ error: null });
    for (const [type, path] of [
      ['signup', '/onboarding'],
      ['recovery', '/reset-password'],
    ]) {
      const response = await confirm(
        new NextRequest(
          `http://127.0.0.1:3000/auth/confirm?type=${type}&token_hash=test-fixture`,
        ),
      );
      expect(response.headers.get('location')).toBe(
        `http://127.0.0.1:3000${path}`,
      );
      expect(mock.verifyOtp).toHaveBeenCalledWith({
        token_hash: 'test-fixture',
        type,
      });
    }
  });
  it('does not validate unsupported invitation/OAuth-like token types', async () => {
    const response = await confirm(
      new NextRequest(
        'http://127.0.0.1:3000/auth/confirm?type=invite&token_hash=test-fixture',
      ),
    );
    expect(response.headers.get('location')).toContain('notice=invalid-link');
    expect(mock.verifyOtp).not.toHaveBeenCalled();
  });
  it('sanitizes expired or reused links without entering reset flow', async () => {
    mock.verifyOtp.mockResolvedValue({
      error: new Error('raw expired token detail'),
    });
    const response = await confirm(
      new NextRequest(
        'http://127.0.0.1:3000/auth/confirm?type=recovery&token_hash=test-fixture',
      ),
    );
    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:3000/login?notice=invalid-link',
    );
  });
  it('rejects arbitrary PKCE redirect destinations', async () => {
    mock.exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await callback(
      new NextRequest(
        'http://127.0.0.1:3000/auth/callback?code=test-fixture&next=https://untrusted.example',
      ),
    );
    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:3000/onboarding',
    );
  });
  it('keeps error redirects on the trusted configured origin', async () => {
    mock.exchangeCodeForSession.mockRejectedValue(new Error('provider outage'));
    const response = await callback(
      new NextRequest(
        'https://untrusted.example/auth/callback?code=test-fixture',
      ),
    );
    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:3000/login?notice=invalid-link',
    );
  });
});
