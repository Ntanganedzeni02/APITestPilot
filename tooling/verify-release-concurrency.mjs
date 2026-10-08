import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
// Local disposable fixture database only. No HTTP, hosted credentials or runner grants.
const [psql, database] = process.argv.slice(2);
if (!psql || !database || !/^[a-z0-9_]+_m111_concurrency$/.test(database))
  throw Error(
    'Usage: node tooling/verify-release-concurrency.mjs <psql> <fresh_name_m111_concurrency>',
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
apply(
  seed +
    "\nset local role authenticated;select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);select public.refresh_project_memory(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid);select public.create_release(current_setting('test.g_pa')::uuid,current_setting('exec.environment')::uuid,'Concurrent local release');commit;",
);
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
      "set application_name='m111_competing_fixture';" +
        auth +
        sqlB +
        ';commit;\n',
    );
    // Prove the second independent backend is actually waiting on the first transaction.
    await until(
      () =>
        apply(
          "select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='m111_competing_fixture' and wait_event_type='Lock');",
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

const release = apply('select id from public.releases limit 1;').trim();
let results = await compete(
  `select public.assess_release('${release}')`,
  `select public.assess_release('${release}')`,
);
assert(
  results.every((r) => r.code === 0),
  'both assessments commit',
);
assert(
  apply('select count(*) from public.release_assessments;').trim() === '1',
  'one logical release assessment',
);
const assessment = apply(
  'select assessment_id from public.releases limit 1;',
).trim();
process.stdout.write(
  'Release assessment: PASS; independent sessions YES; actual lock wait YES.\n',
);
results = await compete(
  `select public.decide_release('${release}','${assessment}',null,'REJECT','First human decision.')`,
  `select public.decide_release('${release}','${assessment}',null,'REJECT','Competing human decision.')`,
);
assert(
  results[0].code === 0 && results[1].code !== 0,
  'one accepted decision, one rejected stale decision',
);
assert(
  results[1].err.includes('Stale release decision'),
  'second reviewer rejected for stale state',
);
assert(
  apply(
    'select count(*)=1 and max(revision)=1 from public.release_decisions;',
  ).trim() === 't',
  'no silent overwrite or partial second history',
);
assert(
  apply(
    'select r.decision_id=d.id from public.releases r join public.release_decisions d on d.release_id=r.id;',
  ).trim() === 't',
  'head points to accepted decision',
);
process.stdout.write(
  'Human decision: PASS; independent sessions YES; actual lock wait YES; one stale rejection.\n',
);
results = await compete(
  `select public.generate_release_report('${release}','${assessment}')`,
  `select public.generate_release_report('${release}','${assessment}')`,
);
assert(
  results.every((r) => r.code === 0),
  'both report requests commit',
);
assert(
  apply('select count(*) from public.release_reports;').trim() === '1',
  'one logical immutable report',
);
process.stdout.write(
  'Release report: PASS; independent sessions YES; actual lock wait YES.\nConcurrency tests: PASS ? 3.\n',
);
