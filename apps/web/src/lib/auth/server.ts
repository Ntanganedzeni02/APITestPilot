import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readAuthConfig } from './config';

export async function authClient() {
  const config = readAuthConfig(process.env);
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.origin.startsWith('https:'),
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        // Server Components cannot set cookies; proxy refreshes before rendering.
        try {
          for (const { name, value, options } of values)
            jar.set(name, value, options);
        } catch {
          /* Rendering context: proxy owns refresh. */
        }
      },
    },
  });
}
export async function requireUser() {
  try {
    readAuthConfig(process.env);
  } catch {
    redirect('/login?notice=configuration');
  }
  const client = await authClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect('/login');
  return { client, user: data.user };
}
