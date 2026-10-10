import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
// Local disposable fixture database only. No HTTP, hosted credentials or runner grants.
const [psql, database] = process.argv.slice(2);
if (!psql || !database || !/^[a-z0-9_]+_m1123_concurrency$/.test(database))
  throw Error(
    'Usage: node tooling/verify-ai-concurrency.mjs <psql> <fresh_name_m1123_concurrency>',
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
apply(seed + '\nreset role;commit;');
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
      "set application_name='m1123_competing_fixture';" +
        auth +
        sqlB +
        ';commit;\n',
    );
    // Prove the second independent backend is actually waiting on the first transaction.
    await until(
      () =>
        apply(
          "select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='m1123_competing_fixture' and wait_event_type='Lock');",
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

const project = apply(
  "select id from public.projects where name='M14 fixture project A'",
).trim();
const source = apply(
  `select id from public.api_imports where project_id='${project}' order by created_at desc,id desc limit 1`,
).trim();
const anchor = apply(
  `select id from public.qa_analyses where project_id='${project}' order by created_at desc,id desc limit 1`,
).trim();
const admit = (hash) =>
  `select public.admit_ai_reasoning('${project}','${source}','PLANNING','${anchor}','gpt-4.1-mini','${hash.repeat(64)}')`;
let results = await compete(admit('a'), admit('b'));
assert(
  results[0].code === 0 &&
    results[1].code !== 0 &&
    results[1].err.includes('Reasoning budget unavailable'),
  'one shared project slot across independent processes',
);
assert(
  apply('select count(*) from public.ai_reasoning_requests').trim() === '1',
  'exactly one durable reservation',
);
process.stdout.write(
  'AI concurrent budget: PASS; independent sessions YES; actual advisory lock wait YES.\n',
);
apply('truncate public.ai_reasoning_requests');
results = await compete(admit('c'), admit('c'));
assert(
  results[0].code === 0 &&
    results[1].code !== 0 &&
    results[1].err.includes('Duplicate reasoning request'),
  'duplicate cannot spend another reservation',
);
process.stdout.write(
  'AI duplicate admission: PASS; independent sessions YES.\n',
);
const ticket = JSON.parse(
  apply(
    "select jsonb_build_object('id',id,'nonce',nonce) from public.ai_reasoning_requests",
  ).trim(),
);
const finish = `select public.complete_ai_reasoning('${ticket.id}','${ticket.nonce}','FAILED','{"inputTokens":null,"outputTokens":null,"responseId":null,"errorCode":"NETWORK"}',null)`;
results = await compete(finish, finish);
assert(
  results[0].code === 0 &&
    results[1].code !== 0 &&
    results[1].err.includes('Request already settled'),
  'receipt terminal state cannot be overwritten',
);
assert(
  apply(
    'select sum(reserved_micro_usd) from public.ai_reasoning_requests',
  ).trim() === '11200',
  'settlement cannot refund reserved cost',
);
process.stdout.write(
  'AI concurrent settlement: PASS; independent sessions YES; no refund or duplicate proposal.\n',
);

for (const code of ['RATE_LIMIT', 'PROVIDER_TRANSIENT', 'PRE_SEND']) {
  apply('truncate public.ai_reasoning_requests');
  const prior = JSON.parse(
    apply(auth + admit('e') + ';commit;')
      .trim()
      .split('\n')
      .at(-1),
  );
  apply(
    auth +
      `select public.complete_ai_reasoning('${prior.id}','${prior.nonce}','FAILED','{"inputTokens":null,"outputTokens":null,"errorCode":"${code}"}',null);commit;`,
  );
  apply(
    "update public.ai_reasoning_requests set created_at=clock_timestamp()-interval '121 seconds'",
  );
  const races = await compete(admit('e'), admit('e'));
  assert(
    races[0].code === 0 &&
      races[1].code !== 0 &&
      races[1].err.includes('Duplicate reasoning request'),
    'concurrent retry produces exactly one new attempt',
  );
  assert(
    apply(
      "select count(*)||':'||sum(reserved_micro_usd)||':'||count(*) filter(where state='RESERVED') from public.ai_reasoning_requests",
    ).trim() === '2:22400:1',
    'original liability and exactly one new reservation preserved',
  );
  process.stdout.write(
    `AI concurrent ${code} retry: PASS; independent sessions YES; actual advisory lock wait YES.\n`,
  );
}
process.stdout.write('Concurrency tests: PASS - 6.\n');
