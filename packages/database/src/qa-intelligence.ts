import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertQaAnalysis,
  assertQaProposal,
  validateId,
  graphCompare,
  type QaRepository,
  type QaAnalysis,
  type QaItem,
  type QaReview,
} from '@testpilot/domain';
import { createTenantService, PersistenceError } from './index.js';
export function createQaRepository(client: SupabaseClient): QaRepository {
  const tenants = createTenantService(client);
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error)
      throw new PersistenceError(
        error.code === '42501'
          ? 'ACCESS'
          : error.code === '40001'
            ? 'CONFLICT'
            : 'DATABASE',
      );
    return validateId(data);
  }
  async function rows(table: string, field: string, id: string) {
    const all: Record<string, unknown>[] = [];
    for (let n = 0; n < 30000; n += 500) {
      let query = client.from(table).select('*').eq(field, id);
      query =
        table === 'qa_item_nodes'
          ? query.order('item_id').order('node_id')
          : table === 'qa_item_edges'
            ? query.order('item_id').order('edge_id')
            : table === 'qa_item_requirements'
              ? query.order('item_id').order('requirement_id')
              : query.order('id');
      const { data, error } = await query.range(n, n + 499);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      all.push(...(data as Record<string, unknown>[]));
      if (data.length < 500) return all;
    }
    throw new PersistenceError('DATABASE');
  }
  return {
    async save(input) {
      assertQaAnalysis(input);
      return rpc('create_qa_analysis', {
        target_workspace: input.workspaceId,
        target_project: input.projectId,
        target_import: input.importId,
        target_graph: input.graphId,
        payload: input,
      });
    },
    async review(
      itemId,
      expectedReviewId,
      decision,
      rationale,
      title,
      statement,
    ) {
      return rpc('review_qa_item', {
        target_item: validateId(itemId),
        expected_review: expectedReviewId ? validateId(expectedReviewId) : null,
        decision_input: decision,
        rationale_input: rationale,
        title_input: title,
        statement_input: statement,
      });
    },
    async add(analysisId, input) {
      assertQaProposal(input);
      if (input.sourceKind !== 'HUMAN_AUTHORED')
        throw new PersistenceError('ACCESS');
      return rpc('add_human_qa_item', {
        target_analysis: validateId(analysisId),
        payload: input,
      });
    },
    async list(workspaceId, projectId) {
      const projects = await tenants.getWorkspaceProjects(workspaceId);
      if (!projects.some((p) => p.id === validateId(projectId)))
        throw new PersistenceError('ACCESS');
      const { data, error } = await client
        .from('qa_analyses')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(10);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      const result: QaAnalysis[] = [];
      for (const a of data as Record<string, unknown>[]) {
        const id = validateId(a['id']);
        if (a['workspace_id'] !== workspaceId || a['project_id'] !== projectId)
          throw new PersistenceError('DATABASE');
        const [items, nodes, edges, links, reviews] = await Promise.all(
          [
            'qa_items',
            'qa_item_nodes',
            'qa_item_edges',
            'qa_item_requirements',
            'qa_reviews',
          ].map((t) => rows(t, 'analysis_id', id)),
        );
        const itemRows = items!;
        const records: QaItem[] = [];
        for (const row of [
          ...itemRows,
          ...nodes!,
          ...edges!,
          ...links!,
          ...reviews!,
        ])
          if (row['analysis_id'] !== id || row['workspace_id'] !== workspaceId)
            throw new PersistenceError('DATABASE');
        const keyById = new Map(
          itemRows.map((i) => [i['id'], i['logical_key']]),
        );
        function grouped(rows: Record<string, unknown>[]) {
          const groups = new Map<unknown, Record<string, unknown>[]>();
          for (const row of rows) {
            if (!keyById.has(row['item_id']))
              throw new PersistenceError('DATABASE');
            const group = groups.get(row['item_id']) ?? [];
            group.push(row);
            groups.set(row['item_id'], group);
          }
          return groups;
        }
        const nodeGroups = grouped(nodes!),
          edgeGroups = grouped(edges!),
          linkGroups = grouped(links!),
          reviewGroups = grouped(reviews!);
        for (const i of itemRows) {
          const itemId = validateId(i['id']);
          if (
            i['behaviour_graph_id'] !== a['behaviour_graph_id'] ||
            i['api_import_id'] !== a['api_import_id'] ||
            i['project_id'] !== projectId
          )
            throw new PersistenceError('DATABASE');
          const proposal: unknown = {
            logicalKey: i['logical_key'],
            kind: i['kind'],
            title: i['title'],
            statement: i['statement'],
            category: i['category'],
            sourceKind: i['source_kind'],
            derivationType: i['derivation_type'],
            confidence: i['confidence'],
            ruleId: i['rule_id'],
            reason: i['reason'],
            sourcePointers: i['source_pointers'],
            nodeRefs: (nodeGroups.get(itemId) ?? []).map((n) => n['node_id']),
            edgeRefs: (edgeGroups.get(itemId) ?? []).map((e) => e['edge_id']),
            requirementRefs: (linkGroups.get(itemId) ?? []).map((l) =>
              keyById.get(l['requirement_id']),
            ),
            severity: i['severity'],
            priority: i['priority'],
          };
          assertQaProposal(proposal);
          if (
            proposal.nodeRefs.length !== i['node_count'] ||
            proposal.edgeRefs.length !== i['edge_count'] ||
            proposal.requirementRefs.length !== i['requirement_count']
          )
            throw new PersistenceError('DATABASE');
          const history = (reviewGroups.get(itemId) ?? [])
            .sort((a, b) => Number(a['revision']) - Number(b['revision']))
            .map((r) => {
              if (
                !['APPROVE', 'REJECT', 'EDIT'].includes(
                  String(r['decision']),
                ) ||
                typeof r['rationale'] !== 'string' ||
                typeof r['created_at'] !== 'string' ||
                !Number.isFinite(Date.parse(r['created_at'])) ||
                !Number.isInteger(r['revision']) ||
                Number(r['revision']) < 1 ||
                r['rationale'].length > 2000 ||
                (r['decision'] === 'EDIT'
                  ? typeof r['title'] !== 'string' ||
                    !r['title'].trim() ||
                    r['title'].length > 160 ||
                    typeof r['statement'] !== 'string' ||
                    !r['statement'].trim() ||
                    r['statement'].length > 4000
                  : r['title'] !== null || r['statement'] !== null)
              )
                throw new PersistenceError('DATABASE');
              return {
                id: validateId(r['id']),
                itemId,
                actorId: validateId(r['actor_id']),
                createdAt: r['created_at'],
                decision: r['decision'] as QaReview['decision'],
                rationale: r['rationale'],
                title: r['title'] as string | null,
                statement: r['statement'] as string | null,
              };
            });
          if (
            typeof i['created_at'] !== 'string' ||
            !Number.isFinite(Date.parse(i['created_at']))
          )
            throw new PersistenceError('DATABASE');
          records.push({
            ...proposal,
            id: itemId,
            analysisId: id,
            createdBy: validateId(i['created_by']),
            createdAt: String(i['created_at']),
            reviews: history,
          });
        }
        records.sort((a, b) => graphCompare(a.logicalKey, b.logicalKey));
        if (
          typeof a['created_at'] !== 'string' ||
          !Number.isFinite(Date.parse(a['created_at']))
        )
          throw new PersistenceError('DATABASE');
        const analysis: QaAnalysis = {
          id,
          workspaceId,
          projectId,
          importId: validateId(a['api_import_id']),
          graphId: validateId(a['behaviour_graph_id']),
          engineVersion: String(a['engine_version']),
          aiStatus: a['ai_status'] as QaAnalysis['aiStatus'],
          aiMetadata: a['ai_metadata'] as QaAnalysis['aiMetadata'],
          aiFailure: a['ai_failure'] as string | null,
          items: records.filter((i) => i.sourceKind !== 'HUMAN_AUTHORED'),
          records,
          createdBy: validateId(a['created_by']),
          createdAt: String(a['created_at']),
        };
        assertQaAnalysis(analysis);
        if (analysis.items.length !== a['generated_item_count'])
          throw new PersistenceError('DATABASE');
        result.push(analysis);
      }
      return result;
    },
  };
}
