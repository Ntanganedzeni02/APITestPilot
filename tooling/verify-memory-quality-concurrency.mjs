import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
// Local disposable fixture database only. No HTTP, hosted credentials or runner grants.
const [psql, database] = process.argv.slice(2);
if (!psql || !database || !/^[a-z0-9_]+_m110_concurrency$/.test(database))
  throw Error(
    'Usage: node tooling/verify-memory-quality-concurrency.mjs <psql> <fresh_name_m110_concurrency>',
  );
const connection = ['-h', '127.0.0.1', '-p', '55433', '-U', 'postgres'];
const args = [
  '-X',
  '-qAt',
  ...connection,
  '-d',
  database,
  '-v',
  'ON_ERROR_STOP=1',
];
const apply = (sql) =>
  execFileSync(psql, args, { input: sql, encoding: 'utf8', timeout: 15000 });
execFileSync(
  join(
    dirname(psql),
    process.platform === 'win32' ? 'createdb.exe' : 'createdb',
  ),
  [...connection, database],
);
apply(readFileSync('supabase/tests/postgres-bootstrap.sql', 'utf8'));
apply(
  'create schema extensions; create extension pg_stat_statements with schema extensions;',
);
for (const file of readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  apply(readFileSync('supabase/migrations/' + file, 'utf8'));
let seed = readFileSync(
  'supabase/tests/fixtures/curiosity-source.sql',
  'utf8',
).replace(
  '\\ir execution-source.sql',
  '\\ir supabase/tests/fixtures/execution-source.sql',
);
apply(seed + '\ncommit;');
const auth =
  "begin;set local role authenticated;select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);";
function session() {
  const child = spawn(psql, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '',
    err = '';
  child.stdout.on('data', (x) => (out += x));
  child.stderr.on('data', (x) => (err += x));
  const done = new Promise((resolve) =>
    child.on('exit', (code) => resolve({ code, out, err })),
  );
  return { child, done, output: () => out };
}
async function until(check) {
  for (let n = 0; n < 100; n++) {
    if (check()) return;
    await delay(50);
  }
  throw Error('Concurrent fixture barrier timed out');
}
async function compete(sqlA, sqlB) {
  const a = session(),
    b = session();
  try {
    a.child.stdin.write(auth + sqlA + ";select 'FIRST_READY';\n");
    await until(() => a.output().includes('FIRST_READY'));
    b.child.stdin.write(
      "set application_name='m110_competing_fixture';" +
        auth +
        sqlB +
        ';commit;\n',
    );
    // Prove the second independent backend is actually waiting on the first transaction.
    await until(
      () =>
        apply(
          "select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='m110_competing_fixture' and wait_event_type='Lock');",
        ).trim() === 't',
    );
    a.child.stdin.end('commit;\n');
    b.child.stdin.end();
    return await Promise.all([a.done, b.done]);
  } finally {
    for (const s of [a, b]) if (s.child.exitCode === null) s.child.kill();
  }
}
const assert = (ok, label) => {
  if (!ok) throw Error(label);
};

const scope = JSON.parse(
  apply(
    "select json_build_object('project',project_id,'environment',environment_id) from public.execution_runs limit 1;",
  ),
);
let results = await compete(
  `select public.refresh_project_memory('${scope.project}','${scope.environment}')`,
  `select public.refresh_project_memory('${scope.project}','${scope.environment}')`,
);
assert(
  results.every((r) => r.code === 0),
  'both refreshes commit',
);
assert(
  apply('select count(*) from public.memory_observations;').trim() === '1',
  'one failed assertion observation',
);
assert(
  apply('select observation_count from public.memory_facts;').trim() === '1',
  'count reflects one observation',
);
process.stdout.write(
  'Memory refresh: PASS; independent sessions YES; actual lock wait YES.\n',
);
results = await compete(
  `select public.assess_project_quality('${scope.project}','${scope.environment}')`,
  `select public.assess_project_quality('${scope.project}','${scope.environment}')`,
);
assert(
  results.every((r) => r.code === 0),
  'both assessments commit',
);
assert(
  apply('select count(*) from public.quality_assessments;').trim() === '1',
  'one immutable assessment',
);
assert(
  apply('select count(*) from public.quality_heads;').trim() === '1',
  'one current assessment head',
);
process.stdout.write(
  'Quality assessment: PASS; independent sessions YES; actual lock wait YES.\nConcurrency tests: PASS ? 2.\n',
);
