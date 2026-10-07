import { it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, request, type Server } from 'node:http';
import {
  executeAuthorized as execute,
  type Connector,
  type Resolver,
} from '../src/index.js';
import type { SafetyContext } from '@testpilot/domain';
const executeAuthorized: typeof execute = (...args) =>
  execute(
    args[0],
    args[1],
    args[2],
    args[3],
    args[4],
    args[5] ?? (async () => true),
  );
let server: Server,
  port: number,
  hits = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    hits++;
    if (req.url === '/slow') return;
    if (req.url === '/redirect') {
      res.writeHead(302, { location: 'http://169.254.169.254/' });
      res.end();
      return;
    }
    if (req.url === '/large') {
      res.end('x'.repeat(2048));
      return;
    }
    if (req.url === '/text') {
      res.setHeader('content-type', 'text/plain');
      res.end('sensitive text');
      return;
    }
    if (req.url === '/empty') {
      res.writeHead(204);
      res.end();
      return;
    }
    res.setHeader(
      'content-type',
      req.url === '/sensitive'
        ? 'application/json; token=fixture-sensitive-marker'
        : 'application/json',
    );
    if (req.url === '/sensitive') {
      res.setHeader('cache-control', 'private, token=fixture-sensitive-marker');
      res.setHeader('x-fixture-sensitive-marker', 'fixture-sensitive-marker');
      res.end(
        '{"fixture-sensitive-marker":[{"nested":{"fixture-sensitive-marker":"fixture-sensitive-marker","token":123}}]}',
      );
      return;
    }
    res.setHeader('set-cookie', 'secret-cookie');
    res.end(req.url === '/malformed' ? 'bad' : '{"token":"secret","count":1}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
// Explicit test transport connects only to the controlled loopback server.
// Production CLI uses pinnedConnector and systemResolver, never this fixture adapter.
const connector: Connector = (options, cb) =>
  request(
    {
      ...options,
      protocol: 'http:',
      hostname: '127.0.0.1',
      port,
      lookup: undefined,
    },
    cb,
  );
const resolver: Resolver = {
  async resolve() {
    return ['93.184.216.34'];
  },
};
function context(path = '/json'): Omit<SafetyContext, 'addresses'> {
  return {
    target: {
      id: 'fixture',
      environmentId: 'fixture',
      type: 'DEVELOPMENT',
      baseUrl: 'http://api.example.test/',
      enabled: true,
      port: 80,
      timeoutMs: 200,
      responseLimit: 1024,
    },
    request: {
      method: 'GET',
      url: 'http://api.example.test' + path,
      headers: { accept: 'application/json' },
      body: null,
      operationPointer: '#/fixture',
      assertions: [
        { kind: 'JSON_VALID', expected: true, pointer: '#/fixture/response' },
      ],
    },
    planningReady: true,
    credentialsRequired: false,
    dependencyRequired: false,
    readinessFailure: null,
    sideEffects: false,
  };
}
it('GET real controlled response is captured only after safety', async () => {
  const r = await executeAuthorized(
    context(),
    false,
    undefined,
    resolver,
    connector,
  );
  expect(r.outcome).toBe('PASSED');
  expect(r.sent).toBe(true);
  expect(r.response?.body).not.toContain('secret');
  expect(r.response?.headers['set-cookie']).toBe('[REDACTED]');
});
it('POST requires exact approval and never retries', async () => {
  const c = context();
  c.request!.method = 'POST';
  const before = hits;
  expect(
    (await executeAuthorized(c, false, undefined, resolver, connector)).sent,
  ).toBe(false);
  await executeAuthorized(c, true, undefined, resolver, connector);
  expect(hits - before).toBe(1);
});
it.each([
  ['/text', 'FAILED'],
  ['/empty', 'FAILED'],
  ['/malformed', 'FAILED'],
  ['/slow', 'ERROR'],
  ['/large', 'ERROR'],
  ['/redirect', 'ERROR'],
] as const)('controlled response %s gives %s', async (path, outcome) => {
  const r = await executeAuthorized(
    context(path),
    false,
    undefined,
    resolver,
    connector,
  );
  expect(r.outcome).toBe(outcome);
  if (path === '/large') expect(r.failure).toBe('RESPONSE_TOO_LARGE');
  if (path === '/redirect') expect(r.failure).toBe('REDIRECT_DISABLED');
  if (path === '/slow') expect(r.failure).toBe('TIMEOUT');
});
it('unsafe DNS blocks before connector', async () => {
  let called = false;
  const r = await executeAuthorized(
    context(),
    true,
    undefined,
    {
      async resolve() {
        return ['127.0.0.1'];
      },
    },
    (o, c) => {
      called = true;
      return connector(o, c);
    },
  );
  expect(called).toBe(false);
  expect(r.outcome).toBe('BLOCKED');
  expect(r.response).toBeNull();
});
it('cancellation before send produces no evidence', async () => {
  const c = new AbortController();
  c.abort();
  const r = await executeAuthorized(
    context(),
    false,
    c.signal,
    resolver,
    connector,
  );
  expect(r.sent).toBe(false);
  expect(r.outcome).toBe('CANCELLED');
});
it('oversized request never reaches network', async () => {
  const c = context();
  c.request!.body = 'x'.repeat(65537);
  const before = hits;
  expect(
    (await executeAuthorized(c, false, undefined, resolver, connector)).outcome,
  ).toBe('ERROR');
  expect(hits).toBe(before);
});

it('connection uses validated address without a second DNS lookup', async () => {
  let resolutions = 0,
    pinned = '';
  const r = await executeAuthorized(
    context(),
    false,
    undefined,
    {
      async resolve() {
        resolutions++;
        return resolutions === 1 ? ['93.184.216.34'] : ['127.0.0.1'];
      },
    },
    (options, callback) => {
      const lookup = options.lookup as (
        _h: string,
        _o: unknown,
        callback: (
          error: Error | null,
          address: string,
          family: number,
        ) => void,
      ) => void;
      lookup('api.example.test', {}, (_err, address) => {
        pinned = address;
      });
      return connector(options, callback);
    },
  );
  expect(r.outcome).toBe('PASSED');
  expect(resolutions).toBe(1);
  expect(pinned).toBe('93.184.216.34');
});
it('cancellation after send records the attempt without claiming remote undo', async () => {
  const control = new AbortController();
  const promise = executeAuthorized(
    context('/slow'),
    false,
    control.signal,
    resolver,
    connector,
  );
  setTimeout(() => control.abort(), 30);
  const result = await promise;
  expect(result.outcome).toBe('CANCELLED');
  expect(result.sent).toBe(true);
});

it('connection failure remains ERROR without fabricated response', async () => {
  const temp = createServer();
  await new Promise<void>((r) => temp.listen(0, '127.0.0.1', r));
  const closed = (temp.address() as { port: number }).port;
  await new Promise<void>((r) => temp.close(() => r()));
  const result = await executeAuthorized(
    context(),
    false,
    undefined,
    resolver,
    (o, c) =>
      request(
        {
          ...o,
          protocol: 'http:',
          hostname: '127.0.0.1',
          port: closed,
          lookup: undefined,
        },
        c,
      ),
  );
  expect(result.outcome).toBe('ERROR');
  expect(result.response).toBeNull();
  expect(result.sent).toBe(false);
});

import { restWorkerStore } from '../src/main.js';
it('worker rejects service-role or browser credentials', () => {
  const token = (role: string) =>
    'header.' +
    Buffer.from(JSON.stringify({ role })).toString('base64url') +
    '.signature';
  expect(() =>
    restWorkerStore(
      'https://project.supabase.co',
      'public',
      token('service_role'),
    ),
  ).toThrow('Dedicated runner role');
  expect(() =>
    restWorkerStore(
      'https://project.supabase.co',
      'public',
      token('authenticated'),
    ),
  ).toThrow();
  expect(() =>
    restWorkerStore(
      'http://project.supabase.co',
      'public',
      token('testpilot_runner'),
    ),
  ).toThrow();
});

it.each([
  'disable environment',
  'change target',
  'revoke review',
  'cancel',
  'stale approval',
  'invalid claim',
])('final send check rejects %s during DNS', async (reason) => {
  let stale = false,
    calls = 0,
    checks = 0;
  const result = await execute(
    context(),
    true,
    undefined,
    {
      async resolve() {
        stale = true;
        return ['93.184.216.34'];
      },
    },
    () => {
      calls++;
      throw Error('No connector expected');
    },
    async () => {
      checks++;
      expect(stale, reason).toBe(true);
      return false;
    },
  );
  expect(checks).toBe(1);
  expect(calls).toBe(0);
  expect(result.sent).toBe(false);
  expect(result.response).toBeNull();
  expect(result.outcome).toBe('BLOCKED');
});
it('missing trusted final authorization fails closed', async () => {
  let calls = 0;
  const result = await execute(context(), true, undefined, resolver, () => {
    calls++;
    throw Error('No connector');
  });
  expect(calls).toBe(0);
  expect(result.outcome).toBe('BLOCKED');
});
it('final authorization failure cannot open a socket', async () => {
  let calls = 0;
  const result = await execute(
    context(),
    true,
    undefined,
    resolver,
    () => {
      calls++;
      throw Error('No connector');
    },
    async () => {
      throw Error('Database unavailable');
    },
  );
  expect(calls).toBe(0);
  expect(result.sent).toBe(false);
});
it('cancellation while awaiting final authorization prevents connector', async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await execute(
    context(),
    true,
    controller.signal,
    resolver,
    () => {
      calls++;
      throw Error('No connector');
    },
    async () => {
      controller.abort();
      return true;
    },
  );
  expect(calls).toBe(0);
  expect(result.outcome).toBe('CANCELLED');
});

it('controlled hostile response never retains header/key/value markers', async () => {
  const result = await executeAuthorized(
    context('/sensitive'),
    false,
    undefined,
    resolver,
    connector,
  );
  expect(result.outcome).toBe('PASSED');
  expect(result.response?.contentType).toBe('application/json');
  expect(JSON.stringify(result)).not.toContain('fixture-sensitive-marker');
  expect(JSON.stringify(result)).not.toContain('123');
});

it('overall timeout bounds the final authorization wait without a socket', async () => {
  let calls = 0;
  const c = context();
  c.target.timeoutMs = 30;
  const result = await execute(
    c,
    true,
    undefined,
    resolver,
    () => {
      calls++;
      throw Error('No socket');
    },
    () => new Promise(() => {}),
  );
  expect(calls).toBe(0);
  expect(result.failure).toBe('TIMEOUT');
});

it('raw DNS exception maps to a closed safe failure code', async () => {
  const result = await execute(
    context(),
    true,
    undefined,
    {
      async resolve() {
        throw Error('TOKEN_SECRET_ABC');
      },
    },
    connector,
    async () => true,
  );
  expect(result.failure).toBe('TRANSPORT_FAILURE');
  expect(JSON.stringify(result)).not.toContain('TOKEN_SECRET_ABC');
});
it('raw connector exception maps to a closed safe failure code', async () => {
  const result = await execute(
    context(),
    true,
    undefined,
    resolver,
    () => {
      throw Error('PASSWORD_VALUE_123');
    },
    async () => true,
  );
  expect(result.failure).toBe('TRANSPORT_FAILURE');
  expect(JSON.stringify(result)).not.toContain('PASSWORD_VALUE_123');
});
