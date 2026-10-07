import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
// Local disposable fixture database only. No HTTP, hosted credentials or runner grants.
const [psql, database] = process.argv.slice(2);
if (!psql || !database || !/^[a-z0-9_]+_m18_concurrency$/.test(database))
  throw Error(
    'Usage: node tooling/verify-evidence-concurrency.mjs <psql> <fresh_name_m18_concurrency>',
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
let seed = readFileSync('supabase/tests/evidence-findings.sql', 'utf8')
  .replaceAll('\r\n', '\n')
  .split("set local role authenticated;\nselect set_config('ev.package'")[0];
seed = seed.replace(
  '\\ir fixtures/execution-source.sql',
  '\\ir supabase/tests/fixtures/execution-source.sql',
);
apply(seed + '\ncommit;');
const run = apply('select id from public.execution_runs;').trim();
if (!/^[0-9a-f-]{36}$/.test(run))
  throw Error('Expected one persisted fixture run');
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
      "set application_name='m18_competing_fixture';" +
        auth +
        sqlB +
        ';commit;\n',
    );
    // Prove the second independent backend is actually waiting on the first transaction.
    await until(
      () =>
        apply(
          "select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='m18_competing_fixture' and wait_event_type='Lock');",
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
let results = await compete(
  `select public.derive_execution_evidence('${run}')`,
  `select public.derive_execution_evidence('${run}')`,
);
assert(
  results.every((r) => r.code === 0),
  'Both derivations must succeed',
);
const state = JSON.parse(
  apply(
    "select json_build_object('packages',(select count(*) from public.evidence_packages),'items',(select count(*) from public.evidence_items),'findings',(select count(*) from public.findings),'occurrences',(select count(*) from public.finding_occurrences),'audits',(select count(*) from public.finding_audit_events),'finding',(select id from public.findings),'count',(select occurrence_count from public.findings),'times',(select first_observed_at=last_observed_at and first_observed_at=(select completed_at from public.execution_runs) from public.findings));",
  ),
);
assert(
  state.packages === 1 &&
    state.items === 5 &&
    state.findings === 1 &&
    state.occurrences === 1 &&
    state.audits === 2 &&
    state.count === 1 &&
    state.times,
  'Derivation integrity and audit counts',
);
const packageId = apply('select id from public.evidence_packages;').trim();
assert(
  results.every((r) => r.out.includes(packageId)),
  'Both callers receive the same valid package',
);
process.stdout.write(
  'Concurrent derivation: PASS; independent sessions YES; duplicate packages/findings/occurrences/items 0.\n',
);
results = await compete(
  `select public.review_finding('${state.finding}',0,'CONFIRM','HIGH','Local fixture review.')`,
  `select public.review_finding('${state.finding}',0,'DISMISS','LOW','Local competing fixture.')`,
);
assert(
  results[0].code === 0 &&
    results[1].code !== 0 &&
    results[1].err.includes('Review changed or already completed'),
  'One success and one controlled stale rejection',
);
const review = JSON.parse(
  apply(
    "select json_build_object('reviews',(select count(*) from public.finding_reviews),'valid',(select status='CONFIRMED' and severity='HIGH' and revision=1 from public.findings),'history',(select previous_status='CANDIDATE' and new_status='CONFIRMED' and previous_severity='MEDIUM' and new_severity='HIGH' and actor_id='14000000-0000-0000-0000-000000000001'::uuid from public.finding_reviews),'audits',(select count(*) from public.finding_audit_events),'confirmed',(select count(*) from public.finding_audit_events where event='FINDING_CONFIRMED'),'dismissed',(select count(*) from public.finding_audit_events where event='FINDING_DISMISSED'),'severity',(select count(*) from public.finding_audit_events where event='FINDING_SEVERITY_CHANGED'));",
  ),
);
assert(
  review.reviews === 1 &&
    review.valid &&
    review.history &&
    review.audits === 4 &&
    review.confirmed === 1 &&
    review.dismissed === 0 &&
    review.severity === 1,
  'Accepted review/history/audit integrity, no rejected mutation',
);
process.stdout.write(
  'Concurrent review: PASS; independent sessions YES; successful decisions 1; stale rejections 1; history valid.\nConcurrency tests: PASS ? 2.\n',
);
