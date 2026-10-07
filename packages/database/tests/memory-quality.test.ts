import { assessQuality, type QualityAssessment } from '@testpilot/domain';
import { it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createMemoryQualityRepository,
  decodeQualityAssessment,
} from '../src/memory-quality.js';
const id = '14000000-0000-0000-0000-000000000001';
it.each(['refresh', 'assess'] as const)('%s sends IDs only', async (method) => {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: method === 'refresh' ? 1 : id, error: null });
  await createMemoryQualityRepository({ rpc } as unknown as SupabaseClient)[
    method
  ](id, id);
  expect(rpc).toHaveBeenCalledExactlyOnceWith(
    method === 'refresh' ? 'refresh_project_memory' : 'assess_project_quality',
    { project_input: id, environment_input: id },
  );
});
it.each(['refresh', 'assess'] as const)(
  '%s invalid UUID rejected',
  async (method) => {
    const rpc = vi.fn();
    await expect(
      createMemoryQualityRepository({ rpc } as unknown as SupabaseClient)[
        method
      ]('invalid', id),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  },
);
it.each(['42501', 'XX000', '23514'])('errors %s sanitized', async (code) => {
  const rpc = vi.fn().mockResolvedValue({
    data: null,
    error: { code, message: 'private secret' },
  });
  await expect(
    createMemoryQualityRepository({ rpc } as unknown as SupabaseClient).assess(
      id,
      id,
    ),
  ).rejects.not.toThrow('private');
});
it.each([-1, 1.5, '1', null])(
  'invalid refresh response %s denied',
  async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    await expect(
      createMemoryQualityRepository({
        rpc,
      } as unknown as SupabaseClient).refresh(id, id),
    ).rejects.toThrow();
  },
);
function fixture(data: unknown = []) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'order', 'range', 'in', 'limit'])
    q[method] = vi.fn(() => q);
  q['maybeSingle'] = vi.fn(async () => ({ data, error: null }));
  q['then'] = vi.fn((resolve: (v: unknown) => unknown) =>
    resolve({ data, error: null }),
  );
  const from = vi.fn(() => q);
  return {
    q,
    from,
    repo: createMemoryQualityRepository({ from } as unknown as SupabaseClient),
  };
}
it('fact reads explicitly scope all tenant/environment keys and paginate', async () => {
  const { repo, q } = fixture();
  await repo.listFacts(id, id, id, {
    page: 2,
    kind: 'ASSERTION_FAILURE_OBSERVED',
    operation: 'known',
  });
  expect(q['eq']).toHaveBeenCalledWith('workspace_id', id);
  expect(q['eq']).toHaveBeenCalledWith('project_id', id);
  expect(q['eq']).toHaveBeenCalledWith('environment_id', id);
  expect(q['range']).toHaveBeenCalledWith(50, 74);
});
it.each([
  { page: -1 },
  { page: 1.5 },
  { kind: 'AI_NOTE' },
  { currentness: 'TRUE' },
  { operation: 'a'.repeat(2001) },
])('invalid filter %j denied before query', async (filters) => {
  const { repo, from } = fixture();
  await expect(repo.listFacts(id, id, id, filters)).rejects.toThrow();
  expect(from).not.toHaveBeenCalled();
});
it('missing current assessment is unknown', async () => {
  const { repo } = fixture(null);
  expect(await repo.current(id, id, id)).toEqual({
    current: null,
    previous: null,
  });
});
it('missing fact returns null without querying observations', async () => {
  const { repo, from } = fixture(null);
  expect(await repo.detail(id, id, id)).toBeNull();
  expect(from).toHaveBeenCalledTimes(1);
});
it('history carries environment scope and page bounds', async () => {
  const { repo, q } = fixture();
  await repo.history(id, id, id, 1);
  expect(q['eq']).toHaveBeenCalledWith('environment_id', id);
  expect(q['range']).toHaveBeenCalledWith(25, 49);
});

it.each([null, {}, { result: { overall: 100 } }, { id: 'forged' }])(
  'malformed snapshot %j is not displayed as intelligence',
  (value) => expect(() => decodeQualityAssessment(value)).toThrow(),
);

const valid = (): QualityAssessment => ({
  id,
  workspace_id: id,
  project_id: id,
  environment_id: id,
  api_import_id: id,
  created_by: id,
  scoring_version: 'api-quality-v1',
  fingerprint: 'a'.repeat(64),
  assessed_at: '2026-10-07T00:00:00Z',
  result: assessQuality({
    sourceId: id,
    analysisId: null,
    knownOperations: 1,
    testedOperations: 1,
    activeRequirements: 0,
    coveredRequirements: 0,
    riskWeight: 0,
    coveredRiskWeight: 0,
    executionPoints: 100,
    findingPenalty: 0,
    freshnessPoints: 100,
    gaps: { requirements: [], risks: [], operations: [] },
    provenance: {
      runIds: [],
      packageIds: [],
      findingIds: [],
      reviewIds: [],
      stateHash: 'a'.repeat(64),
    },
  }),
});
it('persisted exact arithmetic and provenance is accepted', () => {
  const a = valid();
  expect(decodeQualityAssessment(a)).toEqual(a);
});
it.each([
  (a: QualityAssessment) => {
    a.result.overall = 99;
  },
  (a: QualityAssessment) => {
    a.result.dimensions.execution.weight = 99;
  },
  (a: QualityAssessment) => {
    a.result.inputs.sourceId = 'forged';
  },
  (a: QualityAssessment) => {
    a.result.inputs.provenance.runIds = ['private token'];
  },
  (a: QualityAssessment) => {
    a.result.inputs.gaps.operations = ['unhashed'];
  },
  (a: QualityAssessment) => {
    a.scoring_version = 'future';
  },
])('forged or malformed persisted intelligence rejected', (mutate) => {
  const a = valid();
  mutate(a);
  expect(() => decodeQualityAssessment(a)).toThrow();
});

it('persisted query output rejects credential identifiers before presentation', async () => {
  const { repo } = fixture([
    {
      operation_id:
        '["OPERATION","GET /postgresql://fixture:fixture@db.example.invalid/db"]',
    },
  ]);
  await expect(repo.listFacts(id, id, id)).rejects.toThrow();
});
it('persisted null identifier is returned with provenance intact', async () => {
  const fact = { operation_id: null, case_id: id, first_run_id: id };
  const { repo } = fixture([fact]);
  expect(await repo.listFacts(id, id, id)).toEqual([fact]);
});
