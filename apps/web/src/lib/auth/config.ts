export class ConfigurationError extends Error {
  constructor() {
    super('Authentication is not configured. Follow the Supabase setup guide.');
  }
}
export function readAuthConfig(env: Record<string, string | undefined>) {
  const url = env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  const origin = env['APP_ORIGIN'];
  try {
    if (!url || !key || !origin) throw new ConfigurationError();
    const endpoint = new URL(url);
    const app = new URL(origin);
    for (const value of [endpoint, app]) {
      if (
        value.username ||
        value.password ||
        value.search ||
        value.hash ||
        (value.protocol !== 'https:' &&
          !(
            value.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname)
          ))
      )
        throw new ConfigurationError();
    }
    if (endpoint.pathname !== '/' || app.pathname !== '/')
      throw new ConfigurationError();
    // Reject privileged keys even if accidentally assigned to the public variable.
    if (key.startsWith('sb_secret_')) throw new ConfigurationError();
    if (key.includes('.')) {
      const payload: unknown = JSON.parse(atob(key.split('.')[1] ?? ''));
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('role' in payload) ||
        payload.role !== 'anon'
      )
        throw new ConfigurationError();
    } else if (!key.startsWith('sb_publishable_'))
      throw new ConfigurationError();
    return { url: endpoint.origin, key, origin: app.origin };
  } catch {
    throw new ConfigurationError();
  }
}

export const authPaths = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/confirm',
  '/auth/callback',
];
export function isPublicPath(path: string) {
  return authPaths.includes(path);
}
