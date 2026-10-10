import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertBehaviourGraph,
  validateId,
  graphCompare,
  type BehaviourGraph,
  type BehaviourGraphRepository,
  type GraphSnapshot,
} from '@testpilot/domain';
import { createApiKnowledgeRepository, PersistenceError } from './index.js';

export function createBehaviourGraphRepository(
  client: SupabaseClient,
): BehaviourGraphRepository {
  async function authorize(
    workspaceId: string,
    projectId: string,
    importId: string,
  ) {
    validateId(importId);
    const imports = await createApiKnowledgeRepository(client).list(
      workspaceId,
      projectId,
      importId,
    );
    if (!imports.some((i) => i.id === importId))
      throw new PersistenceError('ACCESS');
  }
  // Page through immutable rows: Supabase's default 1,000-row limit must not
  // silently truncate large graphs. Counts below detect missing/provider data.
  async function facts(table: string, graphId: string) {
    const result: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 30000; offset += 500) {
      const { data, error } = await client
        .from(table)
        .select('*')
        .eq('graph_id', graphId)
        .order('logical_id')
        .range(offset, offset + 499);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      result.push(...(data as Record<string, unknown>[]));
      if (data.length < 500) break;
    }
    return result;
  }
  return {
    async save(graph: BehaviourGraph) {
      assertBehaviourGraph(graph);
      await authorize(graph.workspaceId, graph.projectId, graph.importId);
      const { data, error } = await client.rpc('build_behaviour_graph', {
        target_workspace: graph.workspaceId,
        target_project: graph.projectId,
        target_import: graph.importId,
        payload: graph,
      });
      if (error)
        throw new PersistenceError(
          error.code === '42501' ? 'ACCESS' : 'DATABASE',
        );
      return validateId(data);
    },
    async list(workspaceId, projectId, importId, snapshotId) {
      await authorize(workspaceId, projectId, importId);
      let query = client
        .from('behaviour_graphs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('project_id', projectId)
        .eq('api_import_id', importId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);
      if (snapshotId) query = query.eq('id', validateId(snapshotId));
      const { data, error } = await query;
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      const snapshots: GraphSnapshot[] = [];
      for (const row of data as Record<string, unknown>[]) {
        const id = validateId(row['id']);
        const createdBy = validateId(row['created_by']);
        if (
          row['workspace_id'] !== workspaceId ||
          row['project_id'] !== projectId ||
          row['api_import_id'] !== importId ||
          typeof row['created_at'] !== 'string' ||
          !Number.isFinite(Date.parse(row['created_at']))
        )
          throw new PersistenceError('DATABASE');
        const [nodes, edges] = await Promise.all([
          facts('behaviour_graph_nodes', id),
          facts('behaviour_graph_edges', id),
        ]);
        if (
          nodes.length !== row['node_count'] ||
          edges.length !== row['edge_count']
        )
          throw new PersistenceError('DATABASE');
        for (const fact of [...nodes, ...edges])
          if (
            fact['graph_id'] !== id ||
            fact['workspace_id'] !== workspaceId ||
            fact['project_id'] !== projectId ||
            fact['api_import_id'] !== importId
          )
            throw new PersistenceError('DATABASE');
        const graph: unknown = {
          modelVersion: row['model_version'],
          builderVersion: row['builder_version'],
          workspaceId,
          projectId,
          importId,
          nodes: nodes
            .map((n) => ({
              id: n['logical_id'],
              type: n['type'],
              label: n['label'],
              provenance: n['provenance'],
            }))
            .sort((a, b) => graphCompare(String(a.id), String(b.id))),
          edges: edges
            .map((e) => ({
              id: e['logical_id'],
              type: e['type'],
              from: e['from_id'],
              to: e['to_id'],
              provenance: e['provenance'],
            }))
            .sort((a, b) => graphCompare(String(a.id), String(b.id))),
        };
        assertBehaviourGraph(graph);
        snapshots.push({ id, createdBy, createdAt: row['created_at'], graph });
      }
      return snapshots;
    },
  };
}
