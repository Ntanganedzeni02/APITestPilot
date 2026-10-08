import { setTimeout, clearTimeout } from 'node:timers';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
// Fresh disposable local database only; never accepts a remote host.
const [psql, database] = process.argv.slice(2);
if (!psql || !database || !/^[a-z0-9_]+_m17_concurrency$/.test(database))
  throw Error(
    'Usage: node tooling/verify-execution-concurrency.mjs <psql executable> <fresh_name_m17_concurrency>',
  );
const args = [
  '-X',
  '-qAt',
  '-h',
  '127.0.0.1',
  '-p',
  '55433',
  '-U',
  'postgres',
  '-d',
  database,
  '-v',
  'ON_ERROR_STOP=1',
];
execFileSync(
  join(
    dirname(psql),
    process.platform === 'win32' ? 'createdb.exe' : 'createdb',
  ),
  ['-h', '127.0.0.1', '-p', '55433', '-U', 'postgres', database],
);
const apply = (sql) =>
  execFileSync(psql, args, { input: sql, encoding: 'utf8', timeout: 15000 });
apply(readFileSync('supabase/tests/postgres-bootstrap.sql', 'utf8'));
apply(
  'create schema extensions; create extension pg_stat_statements with schema extensions;',
);
for (const file of readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  apply(readFileSync('supabase/migrations/' + file, 'utf8'));
let seed = readFileSync('supabase/tests/safe-execution.sql', 'utf8')
  .replaceAll('\r\n', '\n')
  .split('reset role;\ninsert into public.workspace_members')[0];
seed = seed.replace(
  '\\ir fixtures/execution-source.sql',
  '\\ir supabase/tests/fixtures/execution-source.sql',
);
seed += String.raw`
set local role testpilot_runner;
select set_config('exec.job',public.claim_test_execution()::text,true);
select public.record_execution_safety(current_setting('exec.run')::uuid,(current_setting('exec.job')::jsonb->'run'->>'claim_token')::uuid,'ALLOW','[]','{}','{"method":"GET","url":"https://api.example.test/status","headers":{},"body":null,"assertions":[],"operationPointer":"#/info"}',repeat('a',64));
reset role;commit;
`;
apply(seed);
const first = spawn(psql, args, { stdio: ['pipe', 'pipe', 'pipe'] });
let output = '',
  error = '';
let readyResolve, readyReject;
const ready = new Promise((resolve, reject) => {
  readyResolve = resolve;
  readyReject = reject;
});
first.stdout.on('data', (x) => {
  output += x;
  if (/[0-9a-f]{8}-[0-9a-f-]{27}/.test(output)) readyResolve();
});
first.stderr.on('data', (x) => (error += x));
const done = new Promise((resolve, reject) =>
  first.on('exit', (code) => {
    if (code !== 0) {
      readyReject(Error(error));
      reject(Error(error));
    } else resolve();
  }),
);
const timer = setTimeout(() => first.kill(), 10000);
try {
  first.stdin.write(
    "begin;set local role testpilot_runner;select public.claim_test_execution()->'run'->>'id';\n",
  );
  await ready;
  const second = apply(
    'begin;set local role testpilot_runner;select public.claim_test_execution() is null;commit;',
  );
  if (second.trim() !== 't')
    throw Error('Second worker obtained the locked executable claim');
  first.stdin.end('commit;\n');
  await done;
  process.stdout.write(
    'Concurrent executable claim regression: PASS (two real transactions, SKIP LOCKED).\n',
  );
} finally {
  clearTimeout(timer);
  if (first.exitCode === null) first.stdin.end('rollback;\n');
}
