import { expect, it } from 'vitest';
import { context, uuid } from '../../ai/tests/planning-fixture.js';
import { deriveTestPlan } from '../src/index.js';
import { constructExecution } from '../src/execution.js';
import {
  executionEligibility,
  type TestPlan,
  type ExecutionTarget,
} from '@testpilot/domain';
function fixture(
  options: {
    method?: string;
    parameters?: readonly unknown[];
    security?: readonly unknown[];
    body?: unknown;
    path?: string;
  } = {},
) {
  const document = {
    openapi: '3.0.3',
    info: { title: 'Response readiness fixture', version: '1' },
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
    },
    paths: {
      [options.path ?? '/posts']: {
        [options.method ?? 'get']: {
          parameters: options.parameters ?? [],
          security: options.security ?? [],
          ...(options.body ? { requestBody: options.body } : {}),
          responses: {
            '200': {
              description: 'Declared response',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
      },
    },
  };
  const c = context(JSON.stringify(document));
  const input = deriveTestPlan(c);
  const plan: TestPlan = {
    ...input,
    id: uuid(7000),
    createdBy: c.source.createdBy,
    createdAt: c.source.createdAt,
    records: input.items.map((item, n) => ({
      ...item,
      id: uuid(8000 + n),
      planId: uuid(7000),
      createdBy: c.source.createdBy,
      createdAt: c.source.createdAt,
      reviews: [
        {
          id: uuid(9000 + n),
          itemId: uuid(8000 + n),
          actorId: c.source.createdBy,
          createdAt: c.source.createdAt,
          revision: 1,
          decision: 'APPROVE',
          rationale: 'Synthetic reviewed case',
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
      i.ruleId === 'TEST_DECLARED_RESPONSE' &&
      i.caseType === 'VALID',
  )!;
  const target: ExecutionTarget = {
    id: uuid(7100),
    environmentId: uuid(7101),
    type: 'DEVELOPMENT',
    baseUrl: 'https://api.example.test',
    port: 443,
    enabled: true,
    timeoutMs: 1000,
    responseLimit: 1024,
  };
  return { c, plan, item, target };
}
it('parameterless unauthenticated GET response case needs no external test data and compiles after reviews', () => {
  const { c, plan, item, target } = fixture();
  expect(item.preconditions).toEqual([]);
  expect(item.expectedBehavior).toContain(
    'Response-schema conformance remains unverified',
  );
  expect(executionEligibility(item, plan)).toBe('APPROVED_FOR_EXECUTION');
  const compiled = constructExecution(plan, item, c.source, target);
  expect(compiled).toMatchObject({
    failure: null,
    dependencyRequired: false,
    credentialsRequired: false,
    planningReady: true,
    request: {
      method: 'GET',
      url: 'https://api.example.test/posts',
      body: null,
      assertions: [{ kind: 'STATUS_IN_DECLARED_SET', expected: [200] }],
    },
  });
  item.reviews = [];
  expect(constructExecution(plan, item, c.source, target).planningReady).toBe(
    false,
  );
});
it.each([
  [
    'required query',
    {
      parameters: [
        {
          name: 'limit',
          in: 'query',
          required: true,
          schema: { type: 'integer' },
        },
      ],
    },
  ],
  [
    'required path',
    {
      path: '/posts/{id}',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
      ],
    },
  ],
  ['authenticated GET', { security: [{ bearer: [] }] }],
  [
    'POST body',
    {
      method: 'post',
      body: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['count'],
              properties: { count: { type: 'integer' } },
            },
          },
        },
      },
    },
  ],
  [
    'optional query',
    {
      parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
    },
  ],
] as const)(
  '%s response case retains its unresolved approved-data dependency',
  (_label, options) => {
    const { c, plan, item, target } = fixture(options);
    expect(item.preconditions).toContainEqual({
      kind: 'APPROVED_TEST_DATA',
      reference: null,
    });
    expect(constructExecution(plan, item, c.source, target)).toMatchObject({
      failure: 'BLOCKED_BY_DEPENDENCY',
      request: null,
      dependencyRequired: true,
    });
  },
);
it('does not silently resolve historical or unapproved external test data', () => {
  const { c, plan, item, target } = fixture();
  item.preconditions = [{ kind: 'APPROVED_TEST_DATA', reference: null }];
  expect(constructExecution(plan, item, c.source, target).failure).toBe(
    'BLOCKED_BY_DEPENDENCY',
  );
  item.preconditions[0]!.reference = uuid(9999);
  expect(constructExecution(plan, item, c.source, target).failure).toBe(
    'BLOCKED_BY_DEPENDENCY',
  );
});
it('cross-project source or test-data reference never produces a request', () => {
  const { c, plan, item, target } = fixture();
  item.preconditions = [{ kind: 'APPROVED_TEST_DATA', reference: uuid(9999) }];
  expect(
    constructExecution(
      plan,
      item,
      { ...c.source, projectId: uuid(9998) },
      target,
    ),
  ).toMatchObject({ failure: 'SOURCE_SCOPE_MISMATCH', request: null });
  expect(constructExecution(plan, item, c.source, target).request).toBeNull();
});
it('the exemption does not authorize AI proposals or bypass requirement/scenario approval', () => {
  const { c, plan, item, target } = fixture();
  item.origin = 'AI_PROPOSED';
  item.executable = false;
  expect(constructExecution(plan, item, c.source, target).planningReady).toBe(
    false,
  );
  item.origin = 'DETERMINISTIC';
  item.executable = true;
  plan.records.find((r) => r.logicalKey === item.scenarioKey)!.reviews = [];
  expect(constructExecution(plan, item, c.source, target).planningReady).toBe(
    false,
  );
});
