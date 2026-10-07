import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertTestPlan,
  assertPlanningItem,
  validateId,
  type TestPlanRepository,
  type TestPlan,
  type TestPlanInput,
  type TestItem,
  type TestReview,
  type RequirementVersion,
} from '@testpilot/domain';
import { PersistenceError } from './index.js';
export function createTestPlanRepository(
  client: SupabaseClient,
): TestPlanRepository {
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
    const result: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 10000; offset += 500) {
      const { data, error } = await client
        .from(table)
        .select('*')
        .eq(field, id)
        .order(table === 'test_requirement_versions' ? 'requirement_id' : 'id')
        .range(offset, offset + 499);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      result.push(...data);
      if (data.length < 500) return result;
    }
    throw new PersistenceError('DATABASE');
  }
  const text = (r: Record<string, unknown>, key: string) => {
    if (typeof r[key] !== 'string') throw new PersistenceError('DATABASE');
    return r[key] as string;
  };
  return {
    async save(input) {
      assertTestPlan(input);
      return rpc('create_test_plan', {
        target_analysis: validateId(input.analysisId),
        payload: input,
      });
    },
    async review(
      id,
      expected,
      decision,
      rationale,
      title,
      objective,
      expectedBehavior,
    ) {
      return rpc('review_test_item', {
        target_item: validateId(id),
        expected_review: expected ? validateId(expected) : null,
        decision_input: decision,
        rationale_input: rationale,
        title_input: title,
        objective_input: objective,
        expected_input: expectedBehavior,
      });
    },
    async add(planId, item) {
      assertPlanningItem(item);
      if (item.origin !== 'HUMAN_AUTHORED' || item.executable)
        throw new PersistenceError('ACCESS');
      return rpc('add_human_test_item', {
        target_plan: validateId(planId),
        payload: item,
      });
    },
    async list(workspaceId, projectId) {
      validateId(workspaceId);
      validateId(projectId);
      const { data, error } = await client
        .from('test_plans')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .order('id')
        .limit(10);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      const plans: TestPlan[] = [];
      for (const header of data as Record<string, unknown>[]) {
        const id = validateId(header['id']);
        if (
          header['workspace_id'] !== workspaceId ||
          header['project_id'] !== projectId
        )
          throw new PersistenceError('DATABASE');
        const [items, reviews, versions] = await Promise.all([
          rows('test_items', 'plan_id', id),
          rows('test_reviews', 'plan_id', id),
          rows('test_requirement_versions', 'plan_id', id),
        ]);
        const records: TestItem[] = items.map((row) => {
          const item = row['definition'] as TestItem;
          assertPlanningItem(item);
          if (
            row['workspace_id'] !== workspaceId ||
            row['qa_analysis_id'] !== header['qa_analysis_id'] ||
            row['kind'] !== item.kind ||
            row['logical_key'] !== item.logicalKey ||
            row['origin'] !== item.origin
          )
            throw new PersistenceError('DATABASE');
          const history: TestReview[] = reviews
            .filter((r) => r['item_id'] === row['id'])
            .map((r) => {
              if (
                !['APPROVE', 'REJECT', 'EDIT'].includes(
                  String(r['decision']),
                ) ||
                !Number.isInteger(r['revision']) ||
                r['workspace_id'] !== workspaceId
              )
                throw new PersistenceError('DATABASE');
              const bounded = (v: unknown, n: number) =>
                typeof v === 'string' &&
                v.trim().length > 0 &&
                v.length <= n &&
                v === v.trim();
              if (
                typeof r['rationale'] !== 'string' ||
                r['rationale'].length > 2000 ||
                (r['decision'] === 'EDIT'
                  ? !bounded(r['title'], 160) ||
                    !bounded(r['objective'], 4000) ||
                    !bounded(r['expected_behavior'], 4000)
                  : r['title'] !== null ||
                    r['objective'] !== null ||
                    r['expected_behavior'] !== null)
              )
                throw new PersistenceError('DATABASE');
              return {
                id: validateId(r['id']),
                itemId: validateId(r['item_id']),
                actorId: validateId(r['actor_id']),
                createdAt: text(r, 'created_at'),
                revision: r['revision'] as number,
                decision: r['decision'] as TestReview['decision'],
                rationale: text(r, 'rationale'),
                title: r['title'] as string | null,
                objective: r['objective'] as string | null,
                expectedBehavior: r['expected_behavior'] as string | null,
              };
            })
            .sort((a, b) => a.revision - b.revision);
          return {
            ...item,
            id: validateId(row['id']),
            planId: id,
            createdAt: text(row, 'created_at'),
            createdBy: validateId(row['created_by']),
            reviews: history,
          };
        });
        const requirements: RequirementVersion[] = versions.map((r) => ({
          id: validateId(r['requirement_id']),
          reviewId: r['review_id'] === null ? null : validateId(r['review_id']),
          status: r['status'] as RequirementVersion['status'],
          title: text(r, 'title'),
          statement: text(r, 'statement'),
        }));
        const input: TestPlanInput = {
          workspaceId,
          projectId,
          importId: validateId(header['api_import_id']),
          graphId: validateId(header['behaviour_graph_id']),
          analysisId: validateId(header['qa_analysis_id']),
          engineVersion: text(header, 'engine_version'),
          status: header['status'] as 'DRAFT',
          aiStatus: header['ai_status'] as TestPlanInput['aiStatus'],
          aiMetadata: header['ai_metadata'] as TestPlanInput['aiMetadata'],
          aiFailure: header['ai_failure'] as string | null,
          requirements,
          items: records,
        };
        assertTestPlan(input);
        plans.push({
          ...input,
          id,
          createdAt: text(header, 'created_at'),
          createdBy: validateId(header['created_by']),
          records,
        });
      }
      return plans;
    },
  };
}
