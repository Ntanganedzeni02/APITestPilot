import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
// Local disposable fixture database only. No HTTP, hosted credentials or runner grants.
const [psql, database] = process.argv.slice(2);
if (!psql || !database || !/^[a-z0-9_]+_m19_concurrency$/.test(database))
  throw Error(
    'Usage: node tooling/verify-curiosity-concurrency.mjs <psql> <fresh_name_m19_concurrency>',
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
  seed + '\n\\ir supabase/tests/fixtures/curiosity-neighbours.sql\ncommit;',
);
const run = apply('select id from public.execution_runs;').trim();
const auth =
  "begin;set local role authenticated;select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);";
const investigation = apply(
  auth + `select public.derive_investigation('${run}');commit;`,
)
  .trim()
  .split('\n')
  .at(-1);
const source = JSON.parse(
  apply(
    `select json_build_object('case',(select case_id from public.execution_runs),'evidence',(select id from public.evidence_items order by id limit 1));`,
  ),
);
const payload = JSON.stringify({
  caseId: source.case,
  hypothesis: 'Repeat the selected case to assess its declared assertions.',
  rationale: 'Local labeled concurrency fixture.',
  confidence: 'LOW',
  evidenceItemIds: [source.evidence],
  dependencyId: null,
  bindings: [],
});
const proposal = apply(
  auth +
    `select public.persist_investigation_proposal('${investigation}','${payload.replaceAll("'", "''")}');commit;`,
)
  .trim()
  .split('\n')
  .at(-1);
const fingerprint = apply(
  `select fingerprint from public.investigation_proposals where id='${proposal}';`,
).trim();
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
      "set application_name='m19_competing_fixture';" +
        auth +
        sqlB +
        ';commit;\n',
    );
    // Prove the second independent backend is actually waiting on the first transaction.
    await until(
      () =>
        apply(
          "select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='m19_competing_fixture' and wait_event_type='Lock');",
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
  `select public.decide_investigation_proposal('${proposal}',0,'${fingerprint}',true)`,
  `select public.decide_investigation_proposal('${proposal}',0,'${fingerprint}',false)`,
);
assert(
  results[0].code === 0 &&
    results[1].code !== 0 &&
    results[1].err.includes('Proposal changed'),
  'approve vs reject must accept one and conflict one',
);
assert(
  apply(
    `select count(*) from public.investigation_audit_events where event='PROPOSAL_APPROVED';`,
  ).trim() === '1',
  'one approval audit',
);
assert(
  apply(
    `select count(*) from public.investigation_audit_events where event='PROPOSAL_REJECTED';`,
  ).trim() === '0',
  'no rejected mutation',
);
process.stdout.write(
  'Approve vs reject: PASS; independent sessions YES; actual lock wait YES; one accepted decision.\n',
);
results = await compete(
  `select public.materialize_investigation_proposal('${proposal}','${fingerprint}')`,
  `select public.materialize_investigation_proposal('${proposal}','${fingerprint}')`,
);
assert(
  results.every((r) => r.code === 0),
  'both materialization retries must succeed',
);
const execution = apply(
  `select run_id from public.investigation_proposals where id='${proposal}';`,
).trim();
assert(
  results.every((r) => r.out.includes(execution)),
  'same run returned to both callers',
);
assert(
  apply('select count(*) from public.execution_runs;').trim() === '2',
  'one source plus exactly one new run',
);
assert(
  apply(
    "select count(*) from public.investigation_audit_events where event='PROPOSAL_MATERIALIZED';",
  ).trim() === '1',
  'exactly one materialization audit',
);
process.stdout.write(
  'Duplicate materialization: PASS; independent sessions YES; actual lock wait YES; one execution.\n',
);

// Scenario review must block behind the protected proposal state, not only a case lock.
const scenario = apply(
  `select scenario_id from public.test_items where id='${source.case}';`,
).trim();
const scenarioReview = apply(
  `select id from public.test_reviews where item_id='${scenario}' order by revision desc limit 1;`,
).trim();
results = await compete(
  `select public.persist_investigation_proposal('${investigation}','${payload.replaceAll("'", "''")}')`,
  `select public.review_test_item('${scenario}','${scenarioReview}','APPROVE','Local competing scenario review.',null,null,null)`,
);
assert(
  results.every((r) => r.code === 0),
  'scenario review and persistence serialize',
);
assert(
  apply(`select p.scenario_review_id='${scenarioReview}'::uuid and p.fingerprint=public.curiosity_fingerprint(i,c,plan,p.case_review_id,p.scenario_review_id,p.payload,p.observed_status)
from public.investigation_proposals p join public.investigations i on i.id=p.investigation_id join public.test_items c on c.id=p.case_id join public.test_plans plan on plan.id=p.plan_id where p.id='${proposal}';`).trim() ===
    't',
  'hashed scenario identity equals stored captured identity',
);
assert(
  apply(
    `select id<>'${scenarioReview}'::uuid from public.test_reviews where item_id='${scenario}' order by revision desc limit 1;`,
  ).trim() === 't',
  'competing scenario review actually committed',
);
process.stdout.write(
  'Scenario review identity: PASS; independent sessions YES; actual lock wait YES; captured identity consistent.\n',
);

// Consume the second slot through actual proposal/review/materialization RPCs.
const otherEvidence = apply(
  `select id from public.evidence_items where id<>'${source.evidence}'::uuid order by id limit 1;`,
).trim();
function persist(caseId, evidenceId) {
  const input = JSON.stringify({
    ...JSON.parse(payload),
    caseId,
    evidenceItemIds: [evidenceId],
  }).replaceAll("'", "''");
  return apply(
    auth +
      `select public.persist_investigation_proposal('${investigation}','${input}');commit;`,
  )
    .trim()
    .split('\n')
    .at(-1);
}
function approve(id) {
  const fp = apply(
    `select fingerprint from public.investigation_proposals where id='${id}';`,
  ).trim();
  apply(
    auth +
      `select public.decide_investigation_proposal('${id}',0,'${fp}',true);commit;`,
  );
  return fp;
}
const second = persist(source.case, otherEvidence);
const secondFingerprint = approve(second);
apply(
  auth +
    `select public.materialize_investigation_proposal('${second}','${secondFingerprint}');commit;`,
);
assert(
  apply(
    `select count(*) from public.investigation_proposals where investigation_id='${investigation}' and run_id is not null;`,
  ).trim() === '2',
  'exactly one slot remains; two operation attempts accepted',
);
const neighbours = JSON.parse(
  apply(
    `select json_object_agg(logical_key,id) from public.test_items where logical_key like 'CASE_NEIGHBOUR_%';`,
  ),
);
const third = persist(neighbours.CASE_NEIGHBOUR_a, source.evidence);
const fourth = persist(neighbours.CASE_NEIGHBOUR_b, source.evidence);
const thirdFingerprint = approve(third),
  fourthFingerprint = approve(fourth);
const runCount = Number(
  apply('select count(*) from public.execution_runs;').trim(),
);
const auditCount = Number(
  apply(
    "select count(*) from public.investigation_audit_events where event='PROPOSAL_MATERIALIZED';",
  ).trim(),
);
results = await compete(
  `select public.materialize_investigation_proposal('${third}','${thirdFingerprint}')`,
  `select public.materialize_investigation_proposal('${fourth}','${fourthFingerprint}')`,
);
assert(
  results[0].code === 0 &&
    results[1].code !== 0 &&
    results[1].err.includes('budget exhausted'),
  'last slot accepted once and other request rejected',
);
assert(
  Number(apply('select count(*) from public.execution_runs;').trim()) ===
    runCount + 1,
  'one new execution only',
);
assert(
  apply(
    `select count(*) from public.investigation_proposals where investigation_id='${investigation}' and run_id is not null;`,
  ).trim() === '3',
  'atomic three-step accounting',
);
assert(
  apply(
    `select status='APPROVED' and run_id is null and execution_case_id is null from public.investigation_proposals where id='${fourth}';`,
  ).trim() === 't',
  'losing request leaves no partial materialization',
);
assert(
  Number(
    apply(
      "select count(*) from public.investigation_audit_events where event='PROPOSAL_MATERIALIZED';",
    ).trim(),
  ) ===
    auditCount + 1,
  'one new audit only',
);
process.stdout.write(
  'Final budget slot: PASS; independent sessions YES; actual lock wait YES; one request, one audit, no partial loser.\nConcurrency tests: PASS ? 4.\n',
);
