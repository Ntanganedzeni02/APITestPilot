export function readRunnerConfig(env: Record<string, string | undefined>) {
  const url = env['RUNNER_SUPABASE_URL'];
  const key = env['RUNNER_SUPABASE_PUBLISHABLE_KEY'];
  const token = env['RUNNER_DATABASE_TOKEN'];
  if (!url || !key || !token)
    throw Error('Runner database configuration required');
  let claims: { role?: string; exp?: number };
  try {
    claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as typeof claims;
  } catch {
    throw Error('Dedicated runner token required');
  }
  if (claims?.role !== 'testpilot_runner')
    throw Error('Dedicated runner role required');
  try {
    const endpoint = new URL(url);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.pathname !== '/'
    )
      throw Error();
    if (key.includes('.')) {
      const payload = JSON.parse(
        Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8'),
      ) as { role?: string };
      if (payload?.role !== 'anon') throw Error();
    } else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw Error();
    if (
      token.split('.').length !== 3 ||
      token.split('.').some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
    )
      throw Error();
    if (
      env['NODE_ENV'] === 'production' &&
      (!Number.isSafeInteger(claims.exp) ||
        claims.exp! <= Math.floor(Date.now() / 1000))
    )
      throw Error();
    return { url: endpoint.origin, key, token };
  } catch {
    throw Error(
      'Invalid runner configuration; use HTTPS and a valid dedicated credential',
    );
  }
}
// This validates configuration shape only. PostgREST verifies JWT signatures and authority.
