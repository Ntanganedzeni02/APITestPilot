import process from 'node:process';
import { log } from 'node:console';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const psql = process.argv[2];
if (!psql) throw Error('Pass local psql executable');
const database = 'tp_bulk_' + Date.now() + '_concurrency';
const connection = ['-h', '127.0.0.1', '-p', '55433', '-U', 'postgres'];
execFileSync(
  psql === 'psql'
    ? 'createdb'
    : join(
        dirname(psql),
        process.platform === 'win32' ? 'createdb.exe' : 'createdb',
      ),
  [...connection, database],
);
const args = [
  '-X',
  '-qAt',
  ...connection,
  '-d',
  database,
  '-v',
  'ON_ERROR_STOP=1',
];
const query = (sql) =>
  execFileSync(psql, args, { input: sql, encoding: 'utf8', timeout: 30000 });
query(readFileSync('supabase/tests/postgres-bootstrap.sql', 'utf8'));
query(
  'create schema extensions;create extension pg_stat_statements with schema extensions;',
);
for (const f of readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  query(readFileSync('supabase/migrations/' + f, 'utf8'));
const add =
  "select public.add_human_qa_item(current_setting('test.qa_first')::uuid,pg_temp.qa_proposal()||jsonb_build_object('logicalKey','HUMAN_BULK','sourceKind','HUMAN_AUTHORED','derivationType','HUMAN','confidence','SUPPORTED','ruleId','HUMAN_PROPOSAL'));";
query(
  readFileSync('supabase/tests/fixtures/bulk-review-source.sql', 'utf8') +
    '\n' +
    add +
    '\ncommit;',
);
const rows = JSON.parse(
  query(
    "select jsonb_agg(jsonb_build_object('parent',a.id,'items',(select jsonb_agg(jsonb_build_object('id',i.id,'expectedReviewId',null) order by i.id) from public.qa_items i where i.analysis_id=a.id and i.kind='REQUIREMENT')) order by a.id) from public.qa_analyses a;",
  ).trim(),
);
const two = rows.find((r) => r.items.length === 2),
  one = rows.find((r) => r.items.length === 1);
assert(two && one);
const auth =
  "begin;set local role authenticated;select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);";
const bulk = (r) =>
  "select public.bulk_review_items('QA','" +
  r.parent +
  "'::uuid,'REQUIREMENT','APPROVE','Concurrent fixture review','" +
  JSON.stringify(r.items) +
  "'::jsonb);";
function session(sql) {
  const child = spawn(psql, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '',
    err = '';
  child.stdout.on('data', (x) => (out += x));
  child.stderr.on('data', (x) => (err += x));
  const done = new Promise((resolve) =>
    child.on('exit', (code) => resolve({ code, out, err })),
  );
  child.stdin.end('\\set VERBOSITY verbose\n' + sql);
  return { done, output: () => out };
}
async function race(first, second) {
  const a = session(
    auth + first + "select 'LOCK_HELD';select pg_sleep(1);commit;",
  );
  for (let n = 0; !a.output().includes('LOCK_HELD') && n < 100; n++)
    await delay(50);
  assert(
    a.output().includes('LOCK_HELD'),
    'first session acquired its review locks',
  );
  const b = session(auth + second + 'commit;');
  const [ra, rb] = await Promise.all([a.done, b.done]);
  assert.equal(ra.code, 0);
  assert.notEqual(rb.code, 0);
  assert.match(rb.err, /40001/);
}
await race(bulk(two), bulk(two));
assert.equal(
  Number(
    query(
      "select count(*) from public.qa_reviews where analysis_id='" +
        two.parent +
        "' and decision='APPROVE';",
    ).trim(),
  ),
  2,
);
assert.equal(
  Number(
    query(
      "select count(*) from public.qa_audit_events where analysis_id='" +
        two.parent +
        "' and event='REQUIREMENT_APPROVE';",
    ).trim(),
  ),
  2,
);
log(
  'PASS: overlapping bulk sessions commit exactly one batch and per-item audit.',
);
await race(
  "select public.review_qa_item('" +
    one.items[0].id +
    "'::uuid,null,'APPROVE','Individual concurrent fixture',null,null);",
  bulk(one),
);
assert.equal(
  Number(
    query(
      "select count(*) from public.qa_reviews where analysis_id='" +
        one.parent +
        "';",
    ).trim(),
  ),
  1,
);
log(
  'PASS: individual versus bulk conflict rejects stale batch without extra reviews.',
);
log(
  '2 independent-session concurrency checks passed; disposable local database retained.',
);
