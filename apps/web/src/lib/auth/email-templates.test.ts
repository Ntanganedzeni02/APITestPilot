import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';

const provider = vi.hoisted(() => ({ verifyOtp: vi.fn() }));
vi.mock('./server', () => ({
  authClient: async () => ({ auth: provider }),
}));
import { GET } from '../../app/auth/confirm/route';

describe('repository email links reach the verification handler (provider fixtures)', () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    ['confirmation', 'signup', '/onboarding'],
    ['recovery', 'recovery', '/reset-password'],
  ])(
    '%s template verifies its token before navigation',
    async (template, type, destination) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv(
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        'sb_publishable_fixture',
      );
      vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3000');
      const html = readFileSync(`supabase/templates/${template}.html`, 'utf8');
      const link = html.match(/href="([^"]+)"/)?.[1];
      expect(link).toBe(
        `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`,
      );
      const url = link!
        .replace('{{ .SiteURL }}', 'http://127.0.0.1:3000')
        .replace('{{ .TokenHash }}', 'fixture-token')
        .replaceAll('&amp;', '&');
      provider.verifyOtp.mockResolvedValueOnce({ error: null });
      const response = await GET({ url, nextUrl: new URL(url) } as Parameters<
        typeof GET
      >[0]);
      expect(provider.verifyOtp).toHaveBeenLastCalledWith({
        token_hash: 'fixture-token',
        type,
      });
      expect(response.headers.get('location')).toBe(
        `http://127.0.0.1:3000${destination}`,
      );
    },
  );
});
