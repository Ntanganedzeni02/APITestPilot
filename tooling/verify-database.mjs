import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
const [psql = 'psql', compatibility] = process.argv.slice(2);
if (compatibility && compatibility !== '--allow-pg15')
  throw Error('Unknown verification option');
const connection = ['-h', '127.0.0.1', '-p', '55433', '-U', 'postgres'];
const invoke = (program, args, options = {}) =>
  execFileSync(program, args, {
    encoding: 'utf8',
    timeout: 120000,
    ...options,
  });
const query = (database, sql) =>
  invoke(
    psql,
    ['-X', '-qAt', ...connection, '-d', database, '-v', 'ON_ERROR_STOP=1'],
    { input: sql },
  );
const version = Number(query('postgres', 'show server_version_num;').trim());
if (
  version < 170000 &&
  !(compatibility === '--allow-pg15' && version >= 150000)
)
  throw Error(
    'PostgreSQL 17 required; local PG15 compatibility must be explicit',
  );
if (version < 170000)
  process.stdout.write(
    'PG15 compatibility only; PG17-specific grant assertions remain deferred.\n',
  );
const prefix = 'tp_m1121_' + Date.now();
const database = prefix + '_m110_m111_assertions';
const createdb =
  psql === 'psql'
    ? 'createdb'
    : join(
        dirname(psql),
        process.platform === 'win32' ? 'createdb.exe' : 'createdb',
      );
invoke(createdb, [...connection, database]);
const apply = (sql) => query(database, sql);
apply(readFileSync('supabase/tests/postgres-bootstrap.sql', 'utf8'));
apply(
  'create schema extensions; create extension pg_stat_statements with schema extensions;',
);
for (const migration of readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  apply(readFileSync('supabase/migrations/' + migration, 'utf8'));
for (const suite of [
  'tenancy',
  'api-knowledge',
  'behaviour-graph',
  'qa-intelligence',
  'test-planning',
  'safe-execution',
  'evidence-findings',
  'curiosity-engine',
  'curiosity-boundaries',
  'memory-quality',
  'memory-quality-credentials',
  'memory-quality-clock',
  'release-intelligence',
  'release-intelligence-signals',
  'release-intelligence-clock',
  'runner-recovery',
  'runner-recovery-downstream',
]) {
  const output = invoke(psql, [
    '-X',
    ...connection,
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    'supabase/tests/' + suite + '.sql',
  ]);
  process.stdout.write(
    suite + ': PASS\n' + output.trim().split('\n').slice(-6).join('\n') + '\n',
  );
}
for (const [harness, suffix] of [
  ['execution', 'm17'],
  ['evidence', 'm18'],
  ['curiosity', 'm19'],
  ['memory-quality', 'm110'],
  ['release', 'm111'],
])
  process.stdout.write(
    invoke(process.execPath, [
      'tooling/verify-' + harness + '-concurrency.mjs',
      psql,
      prefix + '_' + suffix + '_concurrency',
    ]),
  );
for (const harness of ['memory-quality', 'release'])
  process.stdout.write(
    invoke(process.execPath, [
      'tooling/verify-' +
        harness +
        (harness === 'release' ? '-policy-parity.mjs' : '-parity.mjs'),
      psql,
      database,
    ]),
  );
process.stdout.write(
  invoke(process.execPath, [
    'tooling/verify-runner-recovery.mjs',
    psql,
    prefix + '_m1122_recovery',
  ]),
);
process.stdout.write(
  'Database verification complete. Disposable fixture databases retained locally; CI service is ephemeral.\n',
);
