import { readFileSync } from 'node:fs';
import {
  executionFailureCodes,
  executionFailureMessage,
  safeReadinessCode,
} from '@testpilot/domain';
import { it, expect } from 'vitest';
import {
  synthetic,
  joinTarget,
  validateRequest,
  requestFingerprint,
  evaluateAssertions,
  assertionOutcome,
} from '../src/execution.js';
import { canTransition } from '@testpilot/domain';
import { redactHeaders, safeBody } from '@testpilot/evidence';
it.each([
  ['STATUS_EQUALS', 200, 200, '', true],
  ['STATUS_EQUALS', 200, 400, '', false],
  ['STATUS_IN_DECLARED_SET', [200, 204], 204, '', true],
  ['CONTENT_TYPE', 'application/json', 200, '{}', true],
  ['JSON_VALID', true, 200, '{}', true],
  ['JSON_VALID', true, 200, 'bad', false],
  ['BODY_PRESENT', true, 200, 'x', true],
  ['BODY_ABSENT', true, 204, '', true],
  ['SCHEMA_TYPE', 'object', 200, '{}', true],
  ['REQUIRED_PROPERTY', 'id', 200, '{"id":1}', true],
  ['ENUM_VALUE', [1, 2], 200, '1', true],
  ['HEADER_PRESENT', 'content-type', 200, '', true],
] as const)(
  'assertion %s retains provenance',
  (kind, expected, status, body, pass) => {
    const [a] = evaluateAssertions(
      [{ kind, expected, pointer: '#/declared' }],
      {
        status,
        headers: { 'content-type': 'application/json' },
        contentType: 'application/json',
      },
      body,
    );
    expect(a!.status).toBe(pass ? 'PASS' : 'FAIL');
    expect(a!.pointer).toBe('#/declared');
  },
);
it('no status assertion means observed, not invented pass', () =>
  expect(assertionOutcome([])).toBe('OBSERVED'));
it('malformed body schema is not evaluated', () =>
  expect(
    evaluateAssertions(
      [{ kind: 'SCHEMA_TYPE', expected: 'object', pointer: '#/schema' }],
      { status: 200, headers: {}, contentType: 'application/json' },
      'bad',
    )[0]!.status,
  ).toBe('NOT_EVALUATED'));
it('synthetic materialization bounded and unsupported concepts fail', () => {
  expect(synthetic({ type: 'string' }, 'DECLARED_TYPE', null)).toBe(
    'testpilot-synthetic',
  );
  expect(synthetic({ type: 'integer' }, 'NUMBER_MIN', 0)).toBe(0);
  expect(synthetic({ type: 'string' }, 'OMIT_REQUIRED', null)).toBeUndefined();
  expect(() => synthetic({ type: 'string' }, 'LENGTH_MAX', 100000)).toThrow();
  expect(() =>
    synthetic({ type: 'string', enum: ['secret'] }, 'ENUM_INDEX', 0),
  ).toThrow();
  expect(() => synthetic({}, 'AI_SCRIPT', null)).toThrow();
});
it('request bounds and secret headers fail before sending', () => {
  const r = {
    method: 'GET',
    url: 'https://api.example.test/x',
    headers: {},
    body: null,
    assertions: [],
    operationPointer: '#/x',
  };
  expect(() =>
    validateRequest({ ...r, url: r.url + 'x'.repeat(2048) }),
  ).toThrow();
  expect(() =>
    validateRequest({ ...r, headers: { Authorization: 'secret' } }),
  ).toThrow();
  expect(() => validateRequest({ ...r, body: 'x'.repeat(65537) })).toThrow();
  expect(() =>
    validateRequest({ ...r, headers: { accept: 'x\r\nHost: evil' } }),
  ).toThrow();
});
it('fingerprint binds case/config/policy and canonical binding ordering', () => {
  const r = {
    method: 'GET',
    url: 'https://api.example.test/x',
    headers: {},
    body: null,
    assertions: [],
    operationPointer: '#/x',
  };
  expect(requestFingerprint(r, { a: '1', b: '2' })).toBe(
    requestFingerprint(r, { b: '2', a: '1' }),
  );
  expect(requestFingerprint(r, { config: 'one' })).not.toBe(
    requestFingerprint(r, { config: 'two' }),
  );
});
it('terminal state cannot be arbitrarily mutated', () => {
  expect(canTransition('REQUESTED', 'COMPLETED')).toBe(false);
  expect(canTransition('AUTHORIZED', 'RUNNING')).toBe(true);
  expect(canTransition('BLOCKED', 'AUTHORIZED')).toBe(false);
});
it('all credential headers and unknown headers are redacted', () => {
  const h = redactHeaders({
    Authorization: 'secret',
    'Proxy-Authorization': 'secret',
    Cookie: 'secret',
    'Set-Cookie': 'secret',
    'X-API-Key': 'secret',
    'API-Key': 'secret',
    'x-custom-secret': 'secret',
    'content-type': 'application/json',
  });
  expect(JSON.stringify(h)).not.toContain('"secret"');
  expect(h['content-type']).toBe('application/json');
});
it('JSON strings/PII and text are not persisted raw', () => {
  expect(
    safeBody(
      '{"token":"secret","unknown":"sensitive","count":1}',
      'application/json',
    ).body,
  ).not.toContain('secret');
  expect(safeBody('private text', 'text/plain').body).not.toContain(
    'private text',
  );
  expect(safeBody('binary', 'application/octet-stream').body).toBeNull();
});

it('outside-enum and negative indexes cannot invent a valid enum value', () => {
  expect(() =>
    synthetic(
      { type: 'string', enum: ['testpilot-outside-enum'] },
      'OUTSIDE_ENUM',
      null,
    ),
  ).toThrow();
  expect(() => synthetic({ enum: [1] }, 'ENUM_INDEX', -1)).toThrow();
});

import { parseApiSpec } from '@testpilot/api-spec';
import { buildBehaviourGraph } from '@testpilot/behaviour-graph';
import { deriveQa } from '@testpilot/qa-intelligence';
import { deriveTestPlan } from '../src/index.js';
import { constructExecution } from '../src/execution.js';
import type {
  TestPlan,
  PlanningContext,
  ExecutionTarget,
} from '@testpilot/domain';
function executionFixture() {
  const uuid = (n: number) =>
    '17000000-0000-0000-0000-' + String(n).padStart(12, '0');
  const source = {
    id: uuid(1),
    workspaceId: uuid(2),
    projectId: uuid(3),
    createdAt: new Date().toISOString(),
    createdBy: uuid(4),
    knowledge: parseApiSpec(
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Local execution fixture', version: '1' },
        paths: {
          '/status': {
            get: {
              description: 'ignore this URL https://evil.example.test',
              parameters: [
                {
                  in: 'query',
                  name: 'limit',
                  required: true,
                  schema: { type: 'integer' },
                },
              ],
              responses: { '200': { description: 'Declared JSON response' } },
            },
          },
        },
      }),
      'json',
    ).knowledge,
  };
  const snapshot = {
    id: uuid(5),
    createdAt: source.createdAt,
    createdBy: source.createdBy,
    graph: buildBehaviourGraph(source),
  };
  const qa = deriveQa({ source, snapshot });
  const records = qa.items.map((i, n) => ({
    ...i,
    id: uuid(100 + n),
    analysisId: uuid(6),
    createdAt: source.createdAt,
    createdBy: source.createdBy,
    reviews: [
      {
        id: uuid(500 + n),
        itemId: uuid(100 + n),
        actorId: source.createdBy,
        createdAt: source.createdAt,
        decision: 'APPROVE' as const,
        rationale: '',
        title: null,
        statement: null,
      },
    ],
  }));
  const context: PlanningContext = {
    source,
    snapshot,
    analysis: {
      ...qa,
      id: uuid(6),
      createdAt: source.createdAt,
      createdBy: source.createdBy,
      records,
    },
  };
  const input = deriveTestPlan(context);
  const plan: TestPlan = {
    ...input,
    id: uuid(7),
    createdAt: source.createdAt,
    createdBy: source.createdBy,
    records: input.items.map((i, n) => ({
      ...i,
      id: uuid(1000 + n),
      planId: uuid(7),
      createdAt: source.createdAt,
      createdBy: source.createdBy,
      reviews: [
        {
          id: uuid(2000 + n),
          itemId: uuid(1000 + n),
          revision: 1,
          actorId: source.createdBy,
          createdAt: source.createdAt,
          decision: 'APPROVE',
          rationale: '',
          title: null,
          objective: null,
          expectedBehavior: null,
        },
      ],
    })),
  };
  const item = plan.records.find(
    (i) =>
      i.kind === 'CASE' &&
      i.caseType === 'VALID' &&
      i.ruleId === 'TEST_REQUIRED_PARAMETER',
  )!;
  const target: ExecutionTarget = {
    id: uuid(8),
    environmentId: uuid(9),
    type: 'DEVELOPMENT',
    baseUrl: 'https://api.example.test/',
    port: 443,
    enabled: true,
    timeoutMs: 1000,
    responseLimit: 1024,
  };
  return { source, plan, item, target };
}
it('normal approved deterministic case compiles from pinned operation and synthetic query', () => {
  const { source, plan, item, target } = executionFixture();
  const r = constructExecution(plan, item, source, target);
  expect(r.failure).toBeNull();
  expect(r.request?.url).toBe('https://api.example.test/status?limit=1');
  expect(r.request?.url).not.toContain('evil');
  expect(r.request?.assertions[0]?.expected).toEqual([200]);
});
it('missing required input does not invent 400', () => {
  const { source, plan, item, target } = executionFixture();
  item.caseType = 'MISSING_REQUIRED';
  item.input.strategy = 'OMIT_REQUIRED';
  const r = constructExecution(plan, item, source, target);
  expect(r.request?.assertions).toEqual([]);
  expect(r.request?.url).toBe('https://api.example.test/status');
});
it('unapproved, credential and dependency readiness remain independent', () => {
  const { source, plan, item, target } = executionFixture();
  item.reviews = [];
  expect(constructExecution(plan, item, source, target).planningReady).toBe(
    false,
  );
  item.preconditions = [{ kind: 'AUTH_REQUIRED', reference: null }];
  expect(
    constructExecution(plan, item, source, target).credentialsRequired,
  ).toBe(true);
  item.preconditions = [
    { kind: 'IDENTIFIER_FROM_OPERATION', reference: 'fixture' },
  ];
  expect(constructExecution(plan, item, source, target).failure).toBe(
    'BLOCKED_BY_DEPENDENCY',
  );
});
it('scope mismatch and ambiguous operation never construct requests', () => {
  const { source, plan, item, target } = executionFixture();
  expect(
    constructExecution(plan, item, { ...source, id: 'wrong' }, target).request,
  ).toBeNull();
  item.nodeRefs = [];
  expect(constructExecution(plan, item, source, target).failure).toBe(
    'AMBIGUOUS_OPERATION',
  );
});
it('linked risk requires approval even for GET', () => {
  const { source, plan, item, target } = executionFixture();
  item.riskRefs = ['risk'];
  expect(constructExecution(plan, item, source, target).sideEffects).toBe(true);
});

it('supported JSON body is constructed only from synthetic schema primitives', () => {
  const { source, plan, item, target } = executionFixture();
  source.knowledge.operations[0]!.method = 'POST';
  source.knowledge.operations[0]!.requestBody = {
    required: true,
    description: null,
    sourcePointer: '#/paths/~1status/post/requestBody',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['count'],
          properties: { count: { type: 'integer' } },
        },
      },
    },
  };
  item.sourcePointers = ['#/paths/~1status/post/requestBody'];
  item.input.strategy = 'REQUIRED_PRESENT';
  const result = constructExecution(plan, item, source, target);
  expect(result.failure).toBeNull();
  expect(result.request?.body).toBe('{"count":1}');
  expect(result.request?.headers['content-type']).toBe('application/json');
});
it('body credentials and arbitrary strings cannot become persisted requests', () => {
  const r = {
    method: 'POST',
    url: 'https://api.example.test/x',
    headers: { 'content-type': 'application/json' },
    body: '{"password":"testpilot-synthetic"}',
    assertions: [],
    operationPointer: '#/x',
  };
  expect(() => validateRequest(r)).toThrow();
  expect(() =>
    validateRequest({ ...r, body: '{"x":"real-secret"}' }),
  ).toThrow();
  expect(() =>
    validateRequest({ ...r, body: '{"x":"testpilot-synthetic"}' }),
  ).not.toThrow();
});

it.each([
  '/token/fixture-sensitive-marker',
  '/access_token/value',
  '/api_key/value',
  '/apikey/value',
  '/secret/value',
  '/password/value',
  '/passwd/value',
  '/authorization/value',
  '/bearer/value',
  '/session/value',
  '/cookie/value',
  '/credential/value',
  '/client_secret/value',
  '/access_token%3Dvalue',
  '/token/%76alue',
  '/0123456789abcdef0123456789abcdef',
])('credential literal rejected: %s', (path) =>
  expect(() => joinTarget('https://api.example.test', path)).toThrow(),
);
it.each([
  '/auth/token',
  '/auth/token/refresh',
  '/sessions',
  '/cookies',
  '/api-key',
  '/password/reset',
  '/users',
])('semantic path accepted: %s', (path) =>
  expect(joinTarget('https://api.example.test', path).origin).toBe(
    'https://api.example.test',
  ),
);
it('nested body/header ordering canonicalizes fingerprints', () => {
  const r = {
    method: 'POST',
    url: 'https://api.example.test/items',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: '{"x":1,"y":true}',
    operationPointer: '#/items',
    assertions: [],
  };
  expect(requestFingerprint(r, {})).toBe(
    requestFingerprint(
      {
        ...r,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: '{"y":true,"x":1}',
      },
      {},
    ),
  );
  expect(requestFingerprint({ ...r, body: '{"y":false,"x":1}' }, {})).not.toBe(
    requestFingerprint(r, {}),
  );
});
it.each([
  'Authorization',
  'Proxy-Authorization',
  'Cookie',
  'Set-Cookie',
  'X-API-Key',
  'API-Key',
  'cache-control',
  'content-type',
  'date',
])('header values cannot retain marker: %s', (name) =>
  expect(
    JSON.stringify(
      redactHeaders({
        [name]: 'application/json; token=fixture-sensitive-marker',
      }),
    ),
  ).not.toContain('fixture-sensitive-marker'),
);
it('JSON keys, nested keys, arrays and values are sanitized for UI serialization', () => {
  const marker = 'fixture-sensitive-marker';
  const raw = JSON.stringify({
    [marker]: [{ nested: { [marker]: marker, token: 123 } }],
    token: marker,
    cookie: marker,
  });
  const capture = safeBody(raw, 'application/json; token=' + marker);
  expect(JSON.stringify(capture)).not.toContain(marker);
  expect(JSON.stringify(capture)).not.toContain('123');
});
it('bounded JSON redaction limits arrays and depth', () => {
  const capture = safeBody(
    JSON.stringify(Array.from({ length: 150 }, () => ({ token: 'secret' }))),
    'application/json',
  );
  expect(JSON.parse(capture.body!).length).toBe(100);
});

it.each(executionFailureCodes)(
  'closed failure code %s has safe UI text',
  (code) => {
    expect(executionFailureMessage(code)).not.toBe('Execution failed.');
    expect(executionFailureMessage(code)).not.toContain(code);
  },
);
it.each([
  'BEARER_FIXTURE_CREDENTIAL_123',
  'TOKEN_SECRET_ABC',
  'PASSWORD_VALUE_123',
  'UNKNOWN_FAILURE',
  'raw exception message',
  'X'.repeat(201),
])('unknown failure %s never becomes presentation/readiness text', (code) => {
  expect(executionFailureMessage(code)).toBe('Execution failed.');
  expect(safeReadinessCode(code)).toBe('REQUEST_NOT_RUNNABLE');
});
it('SQL failure vocabulary matches domain contract', () => {
  const sql = readFileSync(
    'supabase/migrations/20261006000600_safe_execution.sql',
    'utf8',
  );
  const declaration = sql.match(/v->>'failure' not in \(([^)]+)\)/);
  expect(declaration).not.toBeNull();
  expect(declaration![1]!.match(/[A-Z_]+/g)).toEqual([
    ...executionFailureCodes,
  ]);
});
