import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPath, readAuthConfig } from './lib/auth/config';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let config: ReturnType<typeof readAuthConfig> | undefined;
  function privateResponse(result: NextResponse) {
    result.headers.set(
      'Cache-Control',
      'private, no-cache, no-store, must-revalidate, max-age=0',
    );
    result.headers.set('Expires', '0');
    result.headers.set('Pragma', 'no-cache');
    // no-referrer turns native form POST Origin into null in Chromium. Keep
    // same-origin Server Actions valid; suppress token callback referrers only.
    result.headers.set(
      'Referrer-Policy',
      request.nextUrl.pathname.startsWith('/auth/')
        ? 'no-referrer'
        : 'strict-origin-when-cross-origin',
    );
    result.headers.set('Vary', 'Cookie');
    return result;
  }
  function login(notice?: string) {
    const url = new URL('/login', config?.origin ?? request.url);
    url.search = notice ? `?notice=${notice}` : '';
    const result = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
    return privateResponse(result);
  }
  try {
    config = readAuthConfig(process.env);
  } catch {
    return isPublicPath(request.nextUrl.pathname)
      ? privateResponse(response)
      : login('configuration');
  }
  const client = createServerClient(config.url, config.key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.origin.startsWith('https:'),
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        const previous = response.cookies.getAll();
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const cookie of previous) response.cookies.set(cookie);
        for (const { name, value, options } of values)
          response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers))
          response.headers.set(name, value);
      },
    },
  });
  // Verify signed claims; application operations independently call getUser().
  let result;
  try {
    result = await client.auth.getClaims();
  } catch {
    return isPublicPath(request.nextUrl.pathname)
      ? privateResponse(response)
      : login('session-unavailable');
  }
  const { data, error } = result;
  if ((error || !data?.claims) && !isPublicPath(request.nextUrl.pathname))
    return login();
  return privateResponse(response);
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
