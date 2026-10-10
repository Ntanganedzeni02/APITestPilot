'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '../auth/server';
import { getTenantContext } from '../tenancy/context';
import { validateId, canReview } from '@testpilot/domain';
export interface BulkState {
  error?: string;
  saved?: number;
}
export async function bulkReviewAction(
  _previous: BulkState,
  form: FormData,
): Promise<BulkState> {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project)
    return { error: 'Select a workspace and project first.' };
  let submitted = false;
  try {
    const family = String(form.get('family')),
      kind = String(form.get('kind')),
      decision = String(form.get('decision'));
    const parent = validateId(form.get('parentId'));
    const rationale = String(form.get('rationale') ?? '').trim();
    const raw = form.get('items');
    if (
      !['QA', 'PLANNING'].includes(family) ||
      !(
        family === 'QA' ? ['REQUIREMENT', 'RISK'] : ['SCENARIO', 'CASE']
      ).includes(kind) ||
      !['APPROVE', 'REJECT', 'EDIT'].includes(decision) ||
      !canReview(workspace.role, decision as 'APPROVE' | 'REJECT' | 'EDIT')
    )
      return { error: 'Your role cannot make this bulk decision.' };
    if (
      form.get('confirmed') !== 'on' ||
      typeof raw !== 'string' ||
      raw.length > 1048576 ||
      rationale.length > 2000 ||
      (decision !== 'APPROVE' && !rationale)
    )
      return {
        error: 'Confirm the affected items and provide the required reason.',
      };
    const items = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(items) ||
      items.length < 1 ||
      items.length > 50 ||
      new Set(items.map((i) => validateId(i?.id))).size !== items.length
    )
      return { error: 'Select 1 to 50 distinct pending items.' };
    // Parent reads are explicitly scoped to active workspace/project. RPC independently rechecks authority.
    const table = family === 'QA' ? 'qa_analyses' : 'test_plans';
    const { data: context, error: contextError } = await client
      .from(table)
      .select('id')
      .eq('id', parent)
      .eq('workspace_id', workspace.id)
      .eq('project_id', project.id)
      .maybeSingle();
    if (contextError || !context)
      return { error: 'Review context unavailable in this project.' };
    submitted = true;
    const { data, error } = await client.rpc('bulk_review_items', {
      family_input: family,
      parent_input: parent,
      kind_input: kind,
      decision_input: decision,
      rationale_input: rationale,
      items_input: items,
    });
    if (error)
      return {
        error:
          error.code === '40001'
            ? 'Nothing changed. A selection or requirement snapshot changed; reload and review again.'
            : error.code === 'PGRST202'
              ? 'Bulk review is unavailable until migration 01400 is deployed. Individual reviews remain available.'
              : ['42501', '23514', '22P02', '23502', '23503'].includes(
                    error.code,
                  )
                ? 'Nothing changed. Check permissions, pending status and revision fields, then reload.'
                : 'Review acknowledgment is uncertain. Reload history before any new submission.',
      };
    if (data !== items.length)
      return {
        error:
          'Review acknowledgment is uncertain. Reload history before any new submission.',
      };
    for (const path of ['/requirements', '/risks', '/tests'])
      revalidatePath(path);
    return { saved: data };
  } catch {
    return {
      error: submitted
        ? 'Review acknowledgment is uncertain. Reload history before any new submission.'
        : 'Invalid bulk review. Nothing was submitted; reload and check your selection.',
    };
  }
}
