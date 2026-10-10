import { NextResponse, type NextRequest } from 'next/server';
import { authClient } from '../../../lib/auth/server';
import { readAuthConfig } from '../../../lib/auth/config';
export async function GET(request: NextRequest) {
  let destination = '/login?notice=invalid-link';
  let origin = request.url;
  try {
    origin = readAuthConfig(process.env).origin;
    const code = request.nextUrl.searchParams.get('code');
    if (code) {
      const client = await authClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error)
        destination =
          request.nextUrl.searchParams.get('next') === '/reset-password'
            ? '/reset-password'
            : '/onboarding';
    }
    return NextResponse.redirect(new URL(destination, origin));
  } catch {
    return NextResponse.redirect(new URL('/login?notice=invalid-link', origin));
  }
}
