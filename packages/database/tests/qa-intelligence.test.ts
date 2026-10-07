import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseApiSpec } from '@testpilot/api-spec';
import { buildBehaviourGraph } from '@testpilot/behaviour-graph';
import { deriveQa } from '@testpilot/qa-intelligence';
import { createQaRepository } from '../src/index.js';
const ws = '15000000-0000-0000-0000-000000000001',
  project = '15000000-0000-0000-0000-000000000002',
  importId = '15000000-0000-0000-0000-000000000003',
  graphId = '15000000-0000-0000-0000-000000000004',
  analysisId = '15000000-0000-0000-0000-000000000005';
const time = '2026-10-07T00:00:00Z';
const source = {
  id: importId,
  workspaceId: ws,
  projectId: project,
  createdAt: time,
  createdBy: ws,
  knowledge: parseApiSpec(
    readFileSync('packages/qa-intelligence/tests/fixtures/qa.json', 'utf8'),
    'json',
  ).knowledge,
};
const input = deriveQa({
  source,
  snapshot: {
    id: graphId,
    createdAt: time,
    createdBy: ws,
    graph: buildBehaviourGraph(source),
  },
});
function fixture({
  member = true,
  forge = false,
  truncate = false,
  rpcError = false,
  rpcCode = '42501',
  badReview = false,
} = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: analysisId,
    error: rpcError ? { code: rpcCode } : null,
  });
  const ids = new Map(
    input.items.map((item, i) => [
      item.logicalKey,
      `15000000-0000-0000-0000-${String(i + 100).padStart(12, '0')}`,
    ]),
  );
  const scope = {
    analysis_id: analysisId,
    behaviour_graph_id: graphId,
    api_import_id: importId,
    project_id: project,
    workspace_id: forge ? project : ws,
  };
  const facts: Record<string, unknown[]> = {
    qa_items: input.items.map((item) => ({
      ...scope,
      id: ids.get(item.logicalKey),
      logical_key: item.logicalKey,
      kind: item.kind,
      title: item.title,
      statement: item.statement,
      category: item.category,
      source_kind: item.sourceKind,
      derivation_type: item.derivationType,
      confidence: item.confidence,
      rule_id: item.ruleId,
      reason: item.reason,
      source_pointers: item.sourcePointers,
      severity: item.severity,
      priority: item.priority,
      node_count: item.nodeRefs.length,
      edge_count: item.edgeRefs.length,
      requirement_count: item.requirementRefs.length,
      created_at: time,
      created_by: ws,
    })),
    qa_item_nodes: input.items.flatMap((i) =>
      i.nodeRefs.map((node_id) => ({
        ...scope,
        item_id: ids.get(i.logicalKey),
        node_id,
      })),
    ),
    qa_item_edges: input.items.flatMap((i) =>
      i.edgeRefs.map((edge_id) => ({
        ...scope,
        item_id: ids.get(i.logicalKey),
        edge_id,
      })),
    ),
    qa_item_requirements: input.items.flatMap((i) =>
      i.requirementRefs.map((ref) => ({
        ...scope,
        item_id: ids.get(i.logicalKey),
        requirement_id: ids.get(ref),
      })),
    ),
    qa_reviews: badReview
      ? [
          {
            ...scope,
            id: ws,
            item_id: ids.get(input.items[0]!.logicalKey),
            actor_id: ws,
            created_at: time,
            decision: 'EDIT',
            rationale: 'fixture',
            revision: 1,
            title: null,
            statement: null,
          },
        ]
      : [],
  };
  const data: Record<string, unknown[]> = {
    projects: [
      {
        id: project,
        workspace_id: ws,
        name: 'Development fixture',
        created_at: time,
        updated_at: time,
        created_by: ws,
      },
    ],
    qa_analyses: [
      {
        ...scope,
        id: analysisId,
        engine_version: input.engineVersion,
        ai_status: input.aiStatus,
        ai_metadata: null,
        ai_failure: null,
        generated_item_count: input.items.length,
        created_at: time,
        created_by: ws,
      },
    ],
  };
  const client = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: ws } }, error: null }),
    },
    rpc,
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: member ? { role: 'OWNER' } : null,
        error: null,
      }),
      range: (start: number, end: number) =>
        Promise.resolve({
          data: (facts[table] ?? []).slice(start, truncate ? start : end + 1),
          error: null,
        }),
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: data[table] ?? [], error: null }).then(
          resolve,
        );
      },
    })),
  } as unknown as SupabaseClient;
  return { repository: createQaRepository(client), rpc };
}
it('persists exact source identifiers without supplied actor or approval', async () => {
  const f = fixture();
  expect(await f.repository.save(input)).toBe(analysisId);
  expect(f.rpc).toHaveBeenCalledWith('create_qa_analysis', {
    target_workspace: ws,
    target_project: project,
    target_import: importId,
    target_graph: graphId,
    payload: input,
  });
});
it('reconstructs paged normalized requirement/risk traceability', async () => {
  const result = await fixture().repository.list(ws, project);
  expect(
    result[0]?.items.map(
      ({ logicalKey, nodeRefs, edgeRefs, requirementRefs }) => ({
        logicalKey,
        nodeRefs,
        edgeRefs,
        requirementRefs,
      }),
    ),
  ).toEqual(
    input.items.map(({ logicalKey, nodeRefs, edgeRefs, requirementRefs }) => ({
      logicalKey,
      nodeRefs,
      edgeRefs,
      requirementRefs,
    })),
  );
});
it.each([
  { member: false },
  { forge: true },
  { truncate: true },
  { badReview: true },
])('rejects unauthorized or malformed persistence %j', async (options) => {
  await expect(fixture(options).repository.list(ws, project)).rejects.toThrow();
});
it('isolates persistence authorization errors', async () => {
  await expect(
    fixture({ rpcError: true }).repository.save(input),
  ).rejects.toMatchObject({ kind: 'ACCESS' });
});
it('passes optimistic review identity without caller override', async () => {
  const f = fixture();
  await f.repository.review(ws, analysisId, 'APPROVE', 'Reviewed', null, null);
  expect(f.rpc).toHaveBeenCalledWith('review_qa_item', {
    target_item: ws,
    expected_review: analysisId,
    decision_input: 'APPROVE',
    rationale_input: 'Reviewed',
    title_input: null,
    statement_input: null,
  });
});
it('rejects generated origin through human addition adapter', async () => {
  const f = fixture();
  await expect(
    f.repository.add(analysisId, input.items[0]!),
  ).rejects.toMatchObject({ kind: 'ACCESS' });
  expect(f.rpc).not.toHaveBeenCalled();
});

it('reports an optimistic review conflict with a reload instruction', async () => {
  await expect(
    fixture({ rpcError: true, rpcCode: '40001' }).repository.review(
      ws,
      null,
      'APPROVE',
      '',
      null,
      null,
    ),
  ).rejects.toMatchObject({
    kind: 'CONFLICT',
    message: 'This proposal changed. Reload before recording another review.',
  });
});
