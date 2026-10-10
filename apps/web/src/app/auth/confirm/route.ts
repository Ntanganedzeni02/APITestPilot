import { NextResponse, type NextRequest } from 'next/server';
import { authClient } from '../../../lib/auth/server';
import { readAuthConfig } from '../../../lib/auth/config';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  let destination = '/login?notice=invalid-link';
  let origin = request.url;
  try {
    origin = readAuthConfig(process.env).origin;
    if (token && ['email', 'signup', 'recovery'].includes(type ?? '')) {
      const client = await authClient();
      const { error } = await client.auth.verifyOtp({
        token_hash: token,
        type: type as 'email' | 'signup' | 'recovery',
      });
      if (!error)
        destination = type === 'recovery' ? '/reset-password' : '/onboarding';
    }
    return NextResponse.redirect(new URL(destination, origin));
  } catch {
    return NextResponse.redirect(new URL('/login?notice=invalid-link', origin));
  }
}
