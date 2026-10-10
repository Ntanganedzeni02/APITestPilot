import { it, expect, vi } from 'vitest';
import { restWorkerStore, processNext } from '../src/main.js';
import { once } from 'node:events';
import {
  WorkerHealth,
  healthServer,
  persistResult,
  WorkerPersistenceError,
  runWorker,
} from '../src/operations.js';
import { readRunnerConfig } from '../src/config.js';
it('health distinguishes liveness, database readiness and stale lease', () => {
  let now = 10000;
  const health = new WorkerHealth(
    () => {},
    () => now,
  );
  expect(health.snapshot().ready).toBe(false);
  health.lastPoll = now;
  health.lastDatabaseSuccess = now;
  expect(health.snapshot().ready).toBe(true);
  health.activeRun = '14000000-0000-0000-0000-000000000001';
  health.lastRenewal = now;
  now += 16000;
  expect(health.snapshot().leaseHealthy).toBe(false);
  expect(health.snapshot().ready).toBe(false);
  health.stopping = true;
  expect(health.snapshot().alive).toBe(true);
});
it('health HTTP probes expose only operational fields on loopback', async () => {
  const health = new WorkerHealth();
  const server = healthServer(health);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string')
      throw Error('Test listener missing');
    const base = 'http://127.0.0.1:' + address.port;
    expect((await fetch(base + '/live')).status).toBe(200);
    expect((await fetch(base + '/ready')).status).toBe(503);
    expect((await fetch(base + '/secret')).status).toBe(404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
it('structured logs whitelist identifiers, transitions and error categories', () => {
  let output = '';
  const health = new WorkerHealth((line) => {
    output += line;
  });
  health.activeRun = 'https://secret@host/token';
  health.log('PROCESSING_FAILED', 'Authorization: secret');
  expect(output).not.toContain('secret');
  const line = JSON.parse(output);
  expect(line.runId).toBeNull();
  expect(line.outcome).toBe('UNKNOWN');
  expect(line.workerId).toMatch(/^[a-f0-9-]{36}$/);
});
it('lost acknowledgment retries only identical persistence payload', async () => {
  let calls = 0;
  const args = { run_input: 'fixture', result_input: { sent: true } };
  await persistResult(
    {
      async rpc(name, input) {
        expect(name).toBe('finish_test_execution');
        expect(input).toBe(args);
        if (++calls === 1)
          throw new WorkerPersistenceError('DATABASE_UNAVAILABLE');
        return null;
      },
    },
    args,
  );
  expect(calls).toBe(2);
});
it('persistence retry budget is bounded', async () => {
  let calls = 0;
  await expect(
    persistResult(
      {
        async rpc() {
          calls++;
          throw new WorkerPersistenceError('DATABASE_UNAVAILABLE');
        },
      },
      {},
    ),
  ).rejects.toThrow();
  expect(calls).toBe(3);
});
it('authentication rejection never retries persistence', async () => {
  let calls = 0;
  await expect(
    persistResult(
      {
        async rpc() {
          calls++;
          throw new WorkerPersistenceError('AUTH_REJECTED');
        },
      },
      {},
    ),
  ).rejects.toThrow('AUTH_REJECTED');
  expect(calls).toBe(1);
});
it('fenced or invalid result never retries persistence', async () => {
  let calls = 0;
  await expect(
    persistResult(
      {
        async rpc() {
          calls++;
          throw Error('Claim fenced');
        },
      },
      {},
    ),
  ).rejects.toThrow('Claim fenced');
  expect(calls).toBe(1);
});
it('shutdown waits for in-flight completion and claims no further work', async () => {
  const health = new WorkerHealth();
  const shutdown = new AbortController();
  let calls = 0;
  const result = await runWorker(
    async () => {
      calls++;
      shutdown.abort();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return true;
    },
    health,
    shutdown.signal,
    100,
  );
  expect(result).toBe(0);
  expect(calls).toBe(1);
  expect(health.stopping).toBe(true);
});
it('forced shutdown aborts in-flight work at bounded deadline', async () => {
  const health = new WorkerHealth();
  const shutdown = new AbortController();
  let aborted = false;
  const result = await runWorker(
    async (signal) => {
      shutdown.abort();
      signal.addEventListener(
        'abort',
        () => {
          aborted = true;
        },
        { once: true },
      );
      await new Promise(() => {});
      return true;
    },
    health,
    shutdown.signal,
    10,
  );
  expect(result).toBe(1);
  expect(aborted).toBe(true);
});
it('expiry is revalidated during processing without exposing token', () => {
  const token =
    'header.' +
    Buffer.from(JSON.stringify({ role: 'testpilot_runner', exp: 0 })).toString(
      'base64url',
    ) +
    '.signature';
  expect(() =>
    readRunnerConfig({
      NODE_ENV: 'production',
      RUNNER_SUPABASE_URL: 'https://fixture.supabase.co',
      RUNNER_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
      RUNNER_DATABASE_TOKEN: token,
    }),
  ).toThrow('Invalid runner configuration');
});

it('token expiring mid-process stops RPC before any network request', async () => {
  const now = Date.now();
  const token =
    'header.' +
    Buffer.from(
      JSON.stringify({
        role: 'testpilot_runner',
        exp: Math.floor(now / 1000) + 1,
      }),
    ).toString('base64url') +
    '.signature';
  vi.stubEnv('NODE_ENV', 'production');
  const transport = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => {
      throw Error('No network permitted in this test');
    });
  try {
    const store = restWorkerStore(
      'https://fixture.supabase.co',
      'sb_publishable_fixture',
      token,
    );
    vi.spyOn(Date, 'now').mockReturnValue(now + 2000);
    await expect(store.rpc('execution_cancel_requested', {})).rejects.toThrow(
      'AUTH_REJECTED',
    );
    expect(transport).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  }
});

it('expired ownership prevents preparation or any socket creation', async () => {
  const calls: string[] = [];
  const health = new WorkerHealth();
  await expect(
    processNext(
      {
        async rpc(name) {
          calls.push(name);
          return name === 'claim_test_execution'
            ? {
                run: {
                  id: '14000000-0000-0000-0000-000000000001',
                  claim_token: '14000000-0000-0000-0000-000000000002',
                  claim_expires_at: new Date(Date.now() + 45000).toISOString(),
                  claim_generation: 1,
                },
              }
            : true;
        },
      },
      {
        resolve: async () => {
          throw Error('No DNS expected');
        },
      },
      () => {
        throw Error('No connection expected');
      },
      { health },
    ),
  ).rejects.toThrow('Claim fenced');
  expect(calls).toEqual(['claim_test_execution', 'execution_cancel_requested']);
  expect(health.activeRun).toBeNull();
  expect(health.pendingReconciliation).toBe(0);
});
it('exception after claim clears heartbeat and leaves unsent recovery to the database', async () => {
  vi.useFakeTimers();
  let calls = 0;
  const health = new WorkerHealth();
  try {
    await expect(
      processNext(
        {
          async rpc(name) {
            calls++;
            return name === 'claim_test_execution'
              ? {
                  run: {
                    id: '14000000-0000-0000-0000-000000000001',
                    claim_token: '14000000-0000-0000-0000-000000000002',
                    claim_expires_at: new Date(
                      Date.now() + 45000,
                    ).toISOString(),
                    claim_generation: 1,
                  },
                  plan: { records: [] },
                }
              : false;
          },
        },
        undefined,
        undefined,
        { health },
      ),
    ).rejects.toThrow('Invalid worker context');
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(2);
    expect(health.activeRun).toBeNull();
    expect(health.pendingReconciliation).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('legacy schema cannot execute work before recovery migration deployment', async () => {
  let polls = 0;
  await expect(
    processNext({
      async rpc() {
        polls++;
        return {
          run: {
            id: '14000000-0000-0000-0000-000000000001',
            claim_token: '14000000-0000-0000-0000-000000000002',
          },
        };
      },
    }),
  ).rejects.toThrow('Runner recovery migration required');
  expect(polls).toBe(1);
});
