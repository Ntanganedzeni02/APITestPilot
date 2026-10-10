// Local disposable PostgreSQL + real controlled loopback HTTP. No hosted/external traffic.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { URL } from 'node:url';
const { AbortController } = globalThis;
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { executeAuthorized } from '../workers/api-runner/dist/index.js';
import {
  WorkerHealth,
  runWorker,
  persistResult,
  WorkerPersistenceError,
} from '../workers/api-runner/dist/operations.js';
const [psql, database] = process.argv.slice(2);
if (!psql || !/^[a-z0-9_]+_m1122_recovery$/.test(database ?? ''))
  throw Error('Fresh local recovery database required');
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
const q = (sql) =>
  execFileSync(psql, args, {
    input: sql,
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
execFileSync(
  join(
    dirname(psql),
    process.platform === 'win32' ? 'createdb.exe' : 'createdb',
  ),
  [...connection, database],
);
q(readFileSync('supabase/tests/postgres-bootstrap.sql', 'utf8'));
q(
  'create schema extensions;create extension pg_stat_statements with schema extensions;',
);
for (const migration of readdirSync('supabase/migrations')
  .filter((x) => x.endsWith('.sql'))
  .sort())
  q(readFileSync('supabase/migrations/' + migration, 'utf8'));
const seed = readFileSync('supabase/tests/runner-recovery.sql', 'utf8')
  .replace(
    '\\ir fixtures/execution-source.sql',
    '\\ir supabase/tests/fixtures/execution-source.sql',
  )
  .split('create function pg_temp.recovery_job')[0];
q(seed + 'commit;');
const caseId = q(
  "select id from public.test_items where kind='CASE' and definition->'executable'='true'::jsonb order by created_at desc limit 1;",
);
const config = JSON.parse(
  q(
    'select row_to_json(c) from public.environment_execution_configs c limit 1;',
  ),
);
const rpc = (name, sqlArgs = '') =>
  q(
    `begin;set local role testpilot_runner;select public.${name}(${sqlArgs});commit;`,
  );
const fresh = () =>
  q(
    `begin;set local role authenticated;set local "request.jwt.claim.sub"='14000000-0000-0000-0000-000000000001';select public.request_test_execution('${caseId}','${config.environment_id}');commit;`,
  );
const claim = () => {
  const value = rpc('claim_test_execution');
  return value ? JSON.parse(value) : null;
};
const job = () => {
  fresh();
  const safety = claim();
  rpc(
    'record_execution_safety',
    `'${safety.run.id}','${safety.run.claim_token}','ALLOW','[]','{}','{"method":"GET","url":"https://api.example.test/","headers":{},"body":null,"assertions":[],"operationPointer":"#/info"}',repeat('a',64)`,
  );
  return claim();
};
const expire = (run) =>
  q(
    `update public.execution_runs set claim_expires_at=clock_timestamp()-interval '1 second' where id='${run.id}';`,
  );
const authorize = (run) =>
  rpc(
    'authorize_execution_send',
    `'${run.id}','${run.claim_token}',repeat('a',64),'${config.id}','1.0.0'`,
  );
const cancelFixture = (run) =>
  q(
    `update public.execution_runs set status='CANCELLED',claim_token=null,claim_expires_at=null where id='${run.id}';`,
  );
const state = (run) =>
  JSON.parse(
    q(
      `select row_to_json(r) from public.execution_runs r where id='${run.id}';`,
    ),
  );
const parallel = (sql) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(psql, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '',
      err = '';
    child.stdout.on('data', (x) => {
      out += x;
    });
    child.stderr.on('data', (x) => {
      err += x;
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolvePromise(out.trim()) : reject(Error(err)),
    );
    child.stdin.end(sql);
  });
let checks = 0;
const pass = (label) => {
  checks++;
  process.stdout.write('PASS ' + label + '\n');
};
fresh();
const competed = await Promise.all([
  parallel(
    'begin;set local role testpilot_runner;select public.claim_test_execution();select pg_sleep(0.2);commit;',
  ),
  parallel(
    'begin;set local role testpilot_runner;select public.claim_test_execution();select pg_sleep(0.2);commit;',
  ),
]);
const claimed = competed
  .map((x) => x.split('\n').find((line) => line.startsWith('{')))
  .filter(Boolean);
assert.equal(claimed.length, 1);
cancelFixture(JSON.parse(claimed[0]).run);
pass('two independent workers compete for one claim');
let raced = job().run;
expire(raced);
const recovered = await Promise.all([
  parallel(
    'begin;set local role testpilot_runner;select public.claim_test_execution();select pg_sleep(0.2);commit;',
  ),
  parallel(
    'begin;set local role testpilot_runner;select public.claim_test_execution();select pg_sleep(0.2);commit;',
  ),
]);
const nextOwners = recovered
  .map((x) => x.split('\n').find((line) => line.startsWith('{')))
  .filter(Boolean);
assert.equal(nextOwners.length, 1);
const nextOwner = JSON.parse(nextOwners[0]).run;
assert.equal(nextOwner.id, raced.id);
assert.equal(
  q(
    `select count(*) from public.execution_recovery_events where run_id='${raced.id}' and event='RECOVERED_UNSENT';`,
  ),
  '1',
);
pass('competing independent recovery sessions emit one recovery and one owner');
assert.equal(authorize(raced), 'f');
cancelFixture(nextOwner);
pass('old worker cannot authorize after unsent recovery ownership changes');
let deliveries = 0;
const server = createServer((_req, res) => {
  deliveries++;
  setTimeout(() => {
    if (!res.destroyed) {
      res.setHeader('content-type', 'application/json');
      res.end('{}');
    }
  }, 50);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;
const childSource = `import {execFileSync} from 'node:child_process';import {request} from 'node:http';import {executeAuthorized} from ${JSON.stringify(new URL('../workers/api-runner/dist/index.js', import.meta.url).href)};
const [psql,argsText,runText,configId,portText,stage]=process.argv.slice(1);const run=JSON.parse(runText);const args=JSON.parse(argsText);const authorize=()=>execFileSync(psql,args,{input:"begin;set local role testpilot_runner;select public.authorize_execution_send('"+run.id+"','"+run.claim_token+"',repeat('a',64),'"+configId+"','1.0.0');commit;",encoding:'utf8'}).trim()==='t';
if(stage==='beforeSend'){console.log('BEFORE');}else if(stage==='afterIntent'){if(!authorize())throw Error('Denied');console.log('INTENT');}else{const context={target:{id:'fixture',environmentId:'fixture',type:'DEVELOPMENT',baseUrl:'https://api.example.test/',enabled:true,port:443,timeoutMs:10000,responseLimit:1024},request:{method:'GET',url:'https://api.example.test/',headers:{},body:null,operationPointer:'#/info',assertions:[]},planningReady:true,credentialsRequired:false,dependencyRequired:false,readinessFailure:null,sideEffects:true};await executeAuthorized(context,true,undefined,{resolve:async()=>['93.184.216.34']},(options,cb)=>request({...options,protocol:'http:',hostname:'127.0.0.1',port:Number(portText),lookup:undefined},cb),async()=>authorize());console.log('RESPONDED');}
setInterval(()=>{},1000);`;
try {
  for (const stage of ['beforeSend', 'afterIntent', 'received', 'responded']) {
    const current = job().run;
    const before = deliveries;
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        childSource,
        psql,
        JSON.stringify(args),
        JSON.stringify(current),
        config.id,
        String(port),
        stage,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let text = '',
      error = '';
    child.stdout.on('data', (x) => {
      text += x;
    });
    child.stderr.on('data', (x) => {
      error += x;
    });
    const deadline = Date.now() + 10000;
    while (
      stage === 'received'
        ? deliveries === before
        : !text.includes(
            stage === 'beforeSend'
              ? 'BEFORE'
              : stage === 'afterIntent'
                ? 'INTENT'
                : 'RESPONDED',
          )
    ) {
      if (Date.now() > deadline || child.exitCode !== null) {
        child.kill();
        throw Error('Child boundary not reached: ' + stage + ' ' + error);
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    expire(current);
    const next = claim();
    if (stage === 'beforeSend') {
      assert.equal(next.run.id, current.id);
      assert.equal(next.run.status, 'SAFETY_REVIEW');
      assert.notEqual(next.run.claim_token, current.claim_token);
      cancelFixture(next.run);
    } else {
      assert.equal(next, null);
      assert.equal(state(current).recovery_outcome, 'INDETERMINATE');
      assert.equal(claim(), null);
    }
    assert.equal(
      deliveries - before,
      stage === 'received' || stage === 'responded' ? 1 : 0,
    );
    pass(
      'actual worker death ' +
        stage +
        '; durable recovery never duplicates mutation',
    );
  }
  // Keep a real request alive while its database lease expires. The loopback
  // response timer cannot run while the parent executes expiry/recovery SQL.
  const inFlight = job().run;
  const beforeExpiry = deliveries;
  const inFlightChild = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      childSource,
      psql,
      JSON.stringify(args),
      JSON.stringify(inFlight),
      config.id,
      String(port),
      'received',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const waitUntil = Date.now() + 10000;
  while (deliveries === beforeExpiry) {
    if (Date.now() > waitUntil || inFlightChild.exitCode !== null) {
      inFlightChild.kill();
      throw Error('In-flight fixture did not reach target');
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  expire(inFlight);
  assert.equal(claim(), null);
  assert.equal(state(inFlight).recovery_outcome, 'INDETERMINATE');
  assert.equal(authorize(inFlight), 'f');
  const dead = once(inFlightChild, 'exit');
  inFlightChild.kill('SIGKILL');
  await dead;
  assert.equal(deliveries - beforeExpiry, 1);
  pass('lease expires while actual synthetic HTTP is in flight; no replay');
  let current = job().run;
  assert.equal(authorize(current), 't');
  expire(current);
  assert.equal(
    rpc(
      'execution_cancel_requested',
      `'${current.id}','${current.claim_token}'`,
    ),
    't',
  );
  assert.equal(authorize(current), 'f');
  assert.equal(claim(), null);
  pass('lease expiry during request fences renewal and send');
  assert.throws(() =>
    rpc(
      'finish_test_execution',
      `'${current.id}','${current.claim_token}','{"outcome":"ERROR","failure":"TIMEOUT","response":null,"assertions":[],"sent":true}'`,
    ),
  );
  pass('stale completion cannot overwrite recovered outcome');
  current = job().run;
  q(
    `begin;set local role authenticated;set local "request.jwt.claim.sub"='14000000-0000-0000-0000-000000000001';select public.cancel_test_execution('${current.id}');commit;`,
  );
  assert.equal(authorize(current), 'f');
  expire(current);
  assert.equal(claim(), null);
  assert.equal(state(current).status, 'CANCELLED');
  pass('cancellation committed before durable send wins');
  current = job().run;
  await Promise.all([
    parallel(
      `begin;set local role authenticated;set local "request.jwt.claim.sub"='14000000-0000-0000-0000-000000000001';select public.cancel_test_execution('${current.id}');commit;`,
    ),
    parallel(
      `begin;set local role testpilot_runner;select public.authorize_execution_send('${current.id}','${current.claim_token}',repeat('a',64),'${config.id}','1.0.0');commit;`,
    ),
  ]);
  const cancellationState = state(current);
  assert.equal(cancellationState.cancel_requested, true);
  expire(current);
  assert.equal(claim(), null);
  assert.equal(
    state(current).recovery_outcome,
    cancellationState.send_authorized_at ? 'INDETERMINATE' : 'CANCELLED',
  );
  pass(
    'independent cancellation/send race preserves whichever durable boundary wins',
  );

  current = job().run;
  const result = {
    outcome: 'ERROR',
    failure: 'TRANSPORT_FAILURE',
    response: null,
    assertions: [],
    sent: false,
  };
  let attempts = 0;
  await persistResult(
    {
      async rpc() {
        attempts++;
        rpc(
          'finish_test_execution',
          `'${current.id}','${current.claim_token}','${JSON.stringify(result)}'`,
        );
        if (attempts === 1)
          throw new WorkerPersistenceError('DATABASE_UNAVAILABLE');
      },
    },
    {},
  );
  assert.equal(attempts, 2);
  assert.equal(
    q(
      `select count(*) from public.execution_results where run_id='${current.id}';`,
    ),
    '1',
  );
  pass('commit then lost acknowledgment retries identical result once');
  current = job().run;
  const locker = spawn(psql, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let lockReady = '';
  locker.stdout.on('data', (x) => {
    lockReady += x;
  });
  locker.stdin.end(
    `begin;select id from public.execution_runs where id='${current.id}' for update;select pg_sleep(0.3);commit;`,
  );
  while (!lockReady.includes(current.id))
    await new Promise((r) => setTimeout(r, 5));
  attempts = 0;
  await persistResult(
    {
      async rpc() {
        attempts++;
        try {
          q(
            `begin;set local statement_timeout='50ms';set local role testpilot_runner;select public.finish_test_execution('${current.id}','${current.claim_token}','${JSON.stringify(result)}');commit;`,
          );
        } catch {
          throw new WorkerPersistenceError('DATABASE_UNAVAILABLE');
        }
      },
    },
    {},
  );
  assert.ok(attempts > 1);
  assert.equal(
    q(
      `select count(*) from public.execution_results where run_id='${current.id}';`,
    ),
    '1',
  );
  pass(
    'real independent-session database timeout during persistence safely retries',
  );
  const terminal = state(current);
  assert.equal(claim(), null);
  assert.deepEqual(state(current), terminal);
  pass('completed persisted result survives repeated recovery');
  assert.equal(deliveries, 3);
  pass('total duplicate mutation deliveries zero across crash boundaries');
  current = job().run;
  const shutdown = new AbortController();
  const health = new WorkerHealth();
  let polls = 0;
  const shutdownCode = await runWorker(
    async (signal) => {
      polls++;
      const context = {
        target: {
          id: 'fixture',
          environmentId: 'fixture',
          type: 'DEVELOPMENT',
          baseUrl: 'https://api.example.test/',
          enabled: true,
          port: 443,
          timeoutMs: 1000,
          responseLimit: 1024,
        },
        request: {
          method: 'GET',
          url: 'https://api.example.test/',
          headers: {},
          body: null,
          operationPointer: '#/info',
          assertions: [],
        },
        planningReady: true,
        credentialsRequired: false,
        dependencyRequired: false,
        readinessFailure: null,
        sideEffects: true,
      };
      const result = await executeAuthorized(
        context,
        true,
        signal,
        { resolve: async () => ['93.184.216.34'] },
        (options, cb) => {
          const req = request(
            {
              ...options,
              protocol: 'http:',
              hostname: '127.0.0.1',
              port,
              lookup: undefined,
            },
            cb,
          );
          req.once('finish', () => shutdown.abort());
          return req;
        },
        async () => authorize(current) === 't',
      );
      await persistResult(
        {
          async rpc() {
            rpc(
              'finish_test_execution',
              `'${current.id}','${current.claim_token}','${JSON.stringify(result)}'`,
            );
          },
        },
        {},
      );
      return true;
    },
    health,
    shutdown.signal,
    2000,
  );
  assert.equal(shutdownCode, 0);
  assert.equal(polls, 1);
  assert.equal(state(current).status, 'COMPLETED');
  assert.equal(deliveries, 4);
  pass(
    'graceful shutdown persists a real in-flight response without claiming again',
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolvePromise) => server.close(resolvePromise));
}
process.stdout.write(
  'Runner recovery integration: PASS ' +
    checks +
    ' checks; independent sessions and actual process kills; loopback HTTP only.\n',
);
