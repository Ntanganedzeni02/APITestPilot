import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseApiSpec } from '@testpilot/api-spec';
import { buildBehaviourGraph } from '@testpilot/behaviour-graph';
import { createBehaviourGraphRepository } from '../src/index.js';
const ws = '14000000-0000-0000-0000-000000000001',
  project = '14000000-0000-0000-0000-000000000002',
  importId = '14000000-0000-0000-0000-000000000003',
  snapshot = '14000000-0000-0000-0000-000000000004';
const time = '2026-10-06T00:00:00Z';
const graph = buildBehaviourGraph({
  id: importId,
  workspaceId: ws,
  projectId: project,
  createdAt: time,
  createdBy: ws,
  knowledge: parseApiSpec(
    readFileSync('packages/behaviour-graph/tests/fixtures/users.json', 'utf8'),
    'json',
  ).knowledge,
});
function fixture({
  member = true,
  forge = false,
  truncate = false,
  rpcError = false,
} = {}) {
  const range = vi.fn();
  const rpc = vi.fn().mockResolvedValue({
    data: snapshot,
    error: rpcError ? { code: '42501' } : null,
  });
  const scope = {
    graph_id: snapshot,
    api_import_id: importId,
    workspace_id: forge ? project : ws,
    project_id: project,
  };
  const facts: Record<string, unknown[]> = {
    behaviour_graph_nodes: graph.nodes.map((n) => ({
      ...scope,
      logical_id: n.id,
      type: n.type,
      label: n.label,
      provenance: n.provenance,
    })),
    behaviour_graph_edges: graph.edges.map((e) => ({
      ...scope,
      logical_id: e.id,
      type: e.type,
      from_id: e.from,
      to_id: e.to,
      provenance: e.provenance,
    })),
  };
  const data: Record<string, unknown[]> = {
    projects: [
      {
        id: project,
        workspace_id: ws,
        name: 'Test project',
        created_at: time,
        updated_at: time,
        created_by: ws,
      },
    ],
    api_imports: [
      {
        id: importId,
        workspace_id: ws,
        project_id: project,
        created_at: time,
        created_by: ws,
        knowledge: parseApiSpec(
          readFileSync(
            'packages/behaviour-graph/tests/fixtures/users.json',
            'utf8',
          ),
          'json',
        ).knowledge,
      },
    ],
    behaviour_graphs: [
      {
        id: snapshot,
        workspace_id: ws,
        project_id: project,
        api_import_id: importId,
        created_at: time,
        created_by: ws,
        model_version: 1,
        builder_version: '1.0.0',
        node_count: graph.nodes.length,
        edge_count: graph.edges.length,
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
      range: (start: number, end: number) => {
        range(table, start, end);
        return Promise.resolve({
          data: (facts[table] ?? []).slice(start, truncate ? start : end + 1),
          error: null,
        });
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: data[table] ?? [], error: null }).then(
          resolve,
        );
      },
    })),
  } as unknown as SupabaseClient;
  return { repository: createBehaviourGraphRepository(client), rpc, range };
}
it('sends only scoped graph payload and derives no caller identity in the adapter', async () => {
  const f = fixture();
  expect(await f.repository.save(graph)).toBe(snapshot);
  expect(f.rpc).toHaveBeenCalledWith('build_behaviour_graph', {
    target_workspace: ws,
    target_project: project,
    target_import: importId,
    payload: graph,
  });
});
it('reconstructs immutable graph facts and validates counts/scope', async () => {
  const f = fixture();
  expect((await f.repository.list(ws, project, importId))[0]?.graph).toEqual(
    graph,
  );
  expect(f.range).toHaveBeenCalledWith('behaviour_graph_nodes', 0, 499);
});
it.each([{ member: false }, { forge: true }, { truncate: true }])(
  'rejects unauthorized or malformed provider responses %j',
  async (options) => {
    const f = fixture(options);
    await expect(f.repository.list(ws, project, importId)).rejects.toThrow();
  },
);
it('propagates RPC authorization failure without inventing a snapshot', async () => {
  await expect(
    fixture({ rpcError: true }).repository.save(graph),
  ).rejects.toMatchObject({ kind: 'ACCESS' });
});
it('rejects cross-import request before save', async () => {
  const f = fixture();
  const g = structuredClone(graph);
  g.importId = snapshot;
  for (const fact of [...g.nodes, ...g.edges])
    fact.provenance.importId = snapshot;
  await expect(f.repository.save(g)).rejects.toMatchObject({ kind: 'ACCESS' });
  expect(f.rpc).not.toHaveBeenCalled();
});
