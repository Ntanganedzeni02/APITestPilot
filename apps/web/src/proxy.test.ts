import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
const mock = vi.hoisted(() => ({
  claims: vi.fn(),
  writes: undefined as
    | undefined
    | ((
        values: { name: string; value: string; options: CookieOptions }[],
        headers: Record<string, string>,
      ) => void),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: { setAll: typeof mock.writes } },
  ) => {
    mock.writes = options.cookies.setAll;
    return { auth: { getClaims: mock.claims } };
  },
}));
import { proxy } from './proxy';
describe('server route protection (provider contract tests, not live auth)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3000');
    mock.claims.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());
  it('redirects unauthenticated requests to every protected route and disables caching', async () => {
    mock.claims.mockResolvedValue({ data: null, error: null });
    for (const path of [
      '/',
      '/projects',
      '/projects/new',
      '/onboarding',
      '/settings',
      '/findings',
      '/workspaces/new',
    ]) {
      const response = await proxy(
        new NextRequest(`http://127.0.0.1:3000${path}`),
      );
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://127.0.0.1:3000/login',
      );
      expect(response.headers.get('cache-control')).toContain('no-store');
    }
  });
  it('allows authentication routes while signed-out', async () => {
    mock.claims.mockResolvedValue({ data: null, error: null });
    expect(
      (await proxy(new NextRequest('http://127.0.0.1:3000/signup'))).status,
    ).toBe(200);
    expect(
      (
        await proxy(new NextRequest('http://127.0.0.1:3000/signup'))
      ).headers.get('referrer-policy'),
    ).toBe('strict-origin-when-cross-origin');
    expect(
      (
        await proxy(new NextRequest('http://127.0.0.1:3000/auth/confirm'))
      ).headers.get('referrer-policy'),
    ).toBe('no-referrer');
  });
  it('preserves refreshed cookies on the actual response', async () => {
    mock.claims.mockImplementation(async () => {
      mock.writes?.(
        [
          {
            name: 'test-session',
            value: 'test-fixture',
            options: { httpOnly: true },
          },
        ],
        { Pragma: 'no-cache' },
      );
      return { data: { claims: { sub: 'test-user' } }, error: null };
    });
    const response = await proxy(
      new NextRequest('http://127.0.0.1:3000/projects'),
    );
    expect(response.status).toBe(200);
    expect(response.cookies.get('test-session')?.value).toBe('test-fixture');
    expect(response.cookies.get('test-session')?.httpOnly).toBe(true);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('preserves expired-cookie deletion on redirects', async () => {
    mock.claims.mockImplementation(async () => {
      mock.writes?.(
        [{ name: 'test-session', value: '', options: { maxAge: 0 } }],
        {},
      );
      return { data: null, error: new Error('invalid token') };
    });
    const response = await proxy(new NextRequest('http://127.0.0.1:3000/'));
    expect(response.status).toBe(307);
    expect(response.cookies.get('test-session')?.value).toBe('');
    expect(response.cookies.get('test-session')?.maxAge).toBe(0);
  });
  it('fails closed on verification outages and missing configuration', async () => {
    mock.claims.mockRejectedValue(new Error('provider unavailable'));
    expect(
      (await proxy(new NextRequest('http://127.0.0.1:3000/'))).headers.get(
        'location',
      ),
    ).toContain('session-unavailable');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    expect(
      (await proxy(new NextRequest('http://127.0.0.1:3000/'))).headers.get(
        'location',
      ),
    ).toContain('notice=configuration');
    expect(
      (await proxy(new NextRequest('http://127.0.0.1:3000/login'))).status,
    ).toBe(200);
  });
});
