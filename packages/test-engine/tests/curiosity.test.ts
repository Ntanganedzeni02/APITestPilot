import { expect, it } from 'vitest';
import { synthetic, constructExecution } from '../src/execution.js';
import type {
  TestPlan,
  TestItem,
  ApiImportSummary,
  ExecutionTarget,
} from '@testpilot/domain';
it.each([100, 200, 500, 599])(
  'observed status %s materializes bounded integer',
  (value) =>
    expect(synthetic({ type: 'integer' }, 'OBSERVED_STATUS', value)).toBe(
      value,
    ),
);
it.each([99, 600, '200', null, 200.5, NaN])(
  'invalid observed status %s rejected',
  (value) =>
    expect(() =>
      synthetic({ type: 'integer' }, 'OBSERVED_STATUS', value),
    ).toThrow(),
);
it('observed status cannot bind secret string parameter', () =>
  expect(() =>
    synthetic({ type: 'string' }, 'OBSERVED_STATUS', 200),
  ).toThrow());
it('observed status respects numeric enums', () =>
  expect(() =>
    synthetic({ type: 'integer', enum: [201] }, 'OBSERVED_STATUS', 200),
  ).toThrow());
it('materialized case remains normal structured M1.7 request', () => {
  const id = '14000000-0000-0000-0000-000000000001',
    operation = '["OPERATION","GET /fixture"]';
  const review = {
    id,
    decision: 'APPROVE',
    revision: 1,
    title: null,
    objective: null,
    expectedBehavior: null,
  };
  const parent = { id, logicalKey: 'parent', reviews: [review] };
  const item = {
    id,
    kind: 'CASE',
    executable: true,
    logicalKey: 'case',
    scenarioKey: 'parent',
    reviews: [review],
    requirementRefs: [id],
    riskRefs: [],
    preconditions: [],
    nodeRefs: [operation],
    sourcePointers: ['#/paths/~1fixture/get/parameters/0'],
    input: {
      strategy: 'OBSERVED_STATUS',
      pointer: '#/paths/~1fixture/get/parameters/0',
      value: 500,
    },
    caseType: 'VALID',
  } as unknown as TestItem;
  const plan = {
    id,
    workspaceId: id,
    projectId: id,
    importId: id,
    requirements: [{ id, status: 'APPROVED' }],
    records: [parent, item],
  } as unknown as TestPlan;
  const source = {
    id,
    workspaceId: id,
    projectId: id,
    knowledge: {
      operations: [
        {
          key: 'GET /fixture',
          method: 'get',
          path: '/fixture',
          sourcePointer: '#/paths/~1fixture/get',
          parameters: [
            {
              name: 'status',
              location: 'query',
              required: true,
              sourcePointer: '#/paths/~1fixture/get/parameters/0',
              schema: { type: 'integer' },
            },
          ],
          responses: [{ status: '200' }],
          security: [],
        },
      ],
    },
  } as unknown as ApiImportSummary;
  const target = {
    id,
    environmentId: id,
    baseUrl: 'https://api.example.test',
    enabled: true,
    type: 'DEVELOPMENT',
    port: 443,
    timeoutMs: 10000,
    responseLimit: 1048576,
  } as ExecutionTarget;
  const built = constructExecution(plan, item, source, target);
  expect(built.failure).toBeNull();
  expect(built.request?.url).toBe(
    'https://api.example.test/fixture?status=500',
  );
  expect(built.request?.assertions[0]?.kind).toBe('STATUS_IN_DECLARED_SET');
  expect(built.request?.headers).not.toHaveProperty('authorization');
});
