import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { readAuthConfig } from '../apps/web/src/lib/auth/config.js';
import { readRunnerConfig } from '../workers/api-runner/src/config.js';
const token = (
  role = 'testpilot_runner',
  exp = Math.floor(Date.now() / 1000) + 3600,
) =>
  'header.' +
  Buffer.from(JSON.stringify({ role, exp })).toString('base64url') +
  '.signature';
const web = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  APP_ORIGIN: 'https://app.example.test',
};
const runner = {
  NODE_ENV: 'production',
  RUNNER_SUPABASE_URL: 'https://fixture.supabase.co',
  RUNNER_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  RUNNER_DATABASE_TOKEN: token(),
};
describe('deployment environment boundaries', () => {
  it('accepts production HTTPS configuration without exposing secrets', () => {
    expect(readAuthConfig(web).origin).toBe(web.APP_ORIGIN);
    expect(readRunnerConfig(runner).url).toBe(runner.RUNNER_SUPABASE_URL);
  });
  it.each([
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'APP_ORIGIN',
  ])('missing web %s fails safely', (key) =>
    expect(() => readAuthConfig({ ...web, [key]: undefined })).toThrow(),
  );
  it.each([
    'RUNNER_SUPABASE_URL',
    'RUNNER_SUPABASE_PUBLISHABLE_KEY',
    'RUNNER_DATABASE_TOKEN',
  ])('missing runner %s fails safely', (key) =>
    expect(() => readRunnerConfig({ ...runner, [key]: undefined })).toThrow(),
  );
  it.each([
    'not a URL',
    'http://127.0.0.1:3000',
    'https://user:secret@host.test',
    'https://host.test/path',
    'https://host.test/?token=secret',
  ])('production web rejects %s', (value) =>
    expect(() => readAuthConfig({ ...web, APP_ORIGIN: value })).toThrow(),
  );
  it.each([
    'not a URL',
    'http://127.0.0.1:3000',
    'https://user:secret@host.test',
    'https://host.test/path',
    'https://host.test/#token',
  ])('runner rejects unsafe endpoint %s', (value) =>
    expect(() =>
      readRunnerConfig({ ...runner, RUNNER_SUPABASE_URL: value }),
    ).toThrow(),
  );
  it('allows only local development HTTP origins', () =>
    expect(
      readAuthConfig({
        ...web,
        NODE_ENV: 'development',
        APP_ORIGIN: 'http://127.0.0.1:3000',
      }).origin,
    ).toBe('http://127.0.0.1:3000'));
  it.each(['service_role', 'authenticated', 'anon'])(
    'runner rejects role %s',
    (role) =>
      expect(() =>
        readRunnerConfig({ ...runner, RUNNER_DATABASE_TOKEN: token(role) }),
      ).toThrow('Dedicated runner role'),
  );
  it.each(['sb_secret_fixture', 'not-a-key', token('service_role')])(
    'rejects privileged/malformed API keys',
    (key) =>
      expect(() =>
        readRunnerConfig({ ...runner, RUNNER_SUPABASE_PUBLISHABLE_KEY: key }),
      ).toThrow(),
  );
  it.each([0, Math.floor(Date.now() / 1000) - 1])(
    'expired runner token %i fails at production startup',
    (exp) =>
      expect(() =>
        readRunnerConfig({
          ...runner,
          RUNNER_DATABASE_TOKEN: token('testpilot_runner', exp),
        }),
      ).toThrow(),
  );
  it('malformed credential errors contain no credential value', () => {
    const secret = 'DO_NOT_DISCLOSE_FIXTURE';
    try {
      readRunnerConfig({ ...runner, RUNNER_DATABASE_TOKEN: secret });
      throw Error('Expected configuration rejection');
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
  it('public keys cannot be replaced with a service-role key', () =>
    expect(() =>
      readAuthConfig({
        ...web,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fixture',
      }),
    ).toThrow());
  it('production preflight fails with missing configuration without values', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [resolve('tooling/deployment-preflight.mjs'), 'runner'],
        { env: { NODE_ENV: 'production' }, stdio: 'pipe' },
      ),
    ).toThrow();
  });
});
describe('deployment artifacts and CI boundaries', () => {
  it('Vercel installs frozen workspace dependencies and builds dependencies before web', () => {
    const config = JSON.parse(readFileSync('apps/web/vercel.json', 'utf8'));
    expect(config.framework).toBe('nextjs');
    expect(config.installCommand).toContain('--frozen-lockfile');
    expect(config.buildCommand).toContain('@testpilot/web...');
    expect(config.installCommand).toContain('npx --yes pnpm@12.9.1');
    expect(config.buildCommand).toContain('npx --yes pnpm@12.9.1');
  });
  it('runner production image is non-root, isolated and contains no secrets', () => {
    const docker = readFileSync('workers/api-runner/Dockerfile', 'utf8');
    expect(docker).toContain('pnpm@12.9.1');
    expect(docker).toContain('--frozen-lockfile');
    expect(docker).toContain('@testpilot/api-runner...');
    expect(docker).toContain(
      '--prod --legacy --config.allowUnusedPatches=true',
    );
    expect(docker).toContain('USER node');
    expect(docker).toContain('STOPSIGNAL SIGTERM');
    expect(docker).not.toMatch(/ENV.*(TOKEN|KEY)|ARG.*(TOKEN|KEY)/);
  });
  it('Docker build context excludes local credentials and generated installations', () => {
    const ignored = readFileSync('.dockerignore', 'utf8');
    for (const path of [
      '.tools',
      '**/node_modules',
      '**/.env.*',
      'supabase/.temp',
    ])
      expect(ignored.split(/\r?\n/)).toContain(path);
  });
  it('CI uses disposable PG17 and cannot silently omit database checks', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(ci).toContain('postgres:17.11');
    expect(ci).toContain('55433:5432');
    expect(ci).toContain('pnpm verify:database');
    expect(ci).not.toContain('continue-on-error');
    expect(ci).not.toContain('--allow-pg15');
  });
  it('database entrypoint reuses every maintained milestone suite and harness', () => {
    const script = readFileSync('tooling/verify-database.mjs', 'utf8');
    for (const suite of [
      'safe-execution',
      'curiosity-boundaries',
      'memory-quality-credentials',
      'release-intelligence-clock',
    ])
      expect(script).toContain("'" + suite + "'");
    expect(script).toContain('ON_ERROR_STOP=1');
    expect(script).toContain('127.0.0.1');
    expect(script).toContain('version < 170000');
  });
  it('migration inventory preflight is read-only and rejects unexpected inventory', () => {
    const output = execFileSync(
      process.execPath,
      ['tooling/deployment-preflight.mjs', 'migrations'],
      { encoding: 'utf8' },
    );
    expect(output).toContain('Local migration inventory valid');
    expect(existsSync('supabase/migrations/20261007001100.sql')).toBe(false);
  });
  it('runner secrets are absent from web configuration and deployment variables', () => {
    for (const path of [
      'apps/web/next.config.ts',
      'apps/web/vercel.json',
      'apps/web/src/lib/auth/config.ts',
    ])
      expect(readFileSync(path, 'utf8')).not.toContain('RUNNER_DATABASE_TOKEN');
  });
});
