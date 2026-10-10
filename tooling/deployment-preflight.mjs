import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { readAuthConfig } from '../apps/web/src/lib/auth/config.ts';
import { readRunnerConfig } from '../workers/api-runner/src/config.ts';
const phase = process.argv[2];
if (!['build', 'web', 'runner', 'migrations'].includes(phase))
  throw Error('Choose build, web, runner or migrations');
if (Number(process.versions.node.split('.')[0]) !== 24)
  throw Error('Node 24 required');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const run = (args) =>
  execFileSync(pnpm, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
if (phase === 'build') {
  const version = execFileSync(pnpm, ['--version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim();
  if (version !== '12.9.1') throw Error('pnpm 12.9.1 required');
  run(['install', '--frozen-lockfile']);
  run(['--filter', '@testpilot/web...', 'build']);
  run(['--filter', '@testpilot/api-runner...', 'build']);
} else if (phase === 'web' || phase === 'runner') {
  if (process.env['NODE_ENV'] !== 'production' && existsSync('.env.local'))
    process.loadEnvFile('.env.local');
  try {
    if (phase === 'web') readAuthConfig(process.env);
    else readRunnerConfig(process.env);
  } catch {
    process.stderr.write(
      'Configuration invalid or missing; no values disclosed.\n',
    );
    process.exit(1);
  }
} else {
  const migrations = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const expected = [
    '20261006000100_identity_tenancy.sql',
    '20261006000200_api_knowledge.sql',
    '20261006000300_behaviour_graph.sql',
    '20261006000400_qa_intelligence.sql',
    '20261006000500_test_planning.sql',
    '20261006000600_safe_execution.sql',
    '20261007000700_evidence_findings.sql',
    '20261007000800_curiosity_engine.sql',
    '20261007000900_memory_quality_intelligence.sql',
    '20261007001000_release_intelligence_reports.sql',
    '20261008001100_runner_recovery.sql',
    '20261008001200_ai_reasoning.sql',
    '20261008001300_ai_retry.sql',
    '20261009001400_bulk_review.sql',
  ];
  if (JSON.stringify(migrations) !== JSON.stringify(expected))
    throw Error(
      'Expected local migrations 00100 through 01400; 01400 requires separate review/deployment',
    );
  process.stdout.write(
    'Local migration inventory valid. Hosted alignment must be verified separately with authenticated CLI.\n',
  );
}
process.stdout.write(
  'Preflight ' +
    phase +
    ': PASS. This does not establish deployment or live acceptance.\n',
);
