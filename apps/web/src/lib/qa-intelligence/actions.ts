'use server';
import { revalidatePath } from 'next/cache';
import {
  createApiKnowledgeRepository,
  createBehaviourGraphRepository,
  createQaRepository,
  PersistenceError,
} from '@testpilot/database';
import { analyzeQa } from '@testpilot/qa-intelligence';
import {
  validateId,
  ValidationError,
  type QaProposal,
  requirementCategories,
  riskCategories,
  canReview,
} from '@testpilot/domain';
import { requireUser } from '../auth/server';
import { getTenantContext } from '../tenancy/context';
export interface QaActionState {
  error?: string;
  saved?: boolean;
}
function text(form: FormData, key: string, max: number) {
  const value = form.get(key);
  if (typeof value !== 'string' || value.length > max)
    throw new ValidationError('Invalid form input.');
  return value;
}
export async function qaAction(
  _previous: QaActionState,
  form: FormData,
): Promise<QaActionState> {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project) return { error: 'Select a project first.' };
  try {
    const repository = createQaRepository(client);
    const mode = form.get('mode');
    if (mode === 'ANALYZE') {
      const importId = validateId(form.get('importId')),
        graphId = validateId(form.get('graphId'));
      const source = (
        await createApiKnowledgeRepository(client).list(
          workspace.id,
          project.id,
          importId,
        )
      ).find((i) => i.id === importId);
      const snapshot = (
        await createBehaviourGraphRepository(client).list(
          workspace.id,
          project.id,
          importId,
          graphId,
        )
      )[0];
      if (!source || !snapshot)
        throw new ValidationError('The selected source is unavailable.');
      await repository.save(await analyzeQa({ source, snapshot }));
    } else {
      const analyses = await repository.list(workspace.id, project.id);
      if (mode === 'REVIEW') {
        const itemId = validateId(form.get('itemId'));
        const item = analyses
          .flatMap((a) => a.records)
          .find((i) => i.id === itemId);
        if (!item) throw new ValidationError('This proposal is unavailable.');
        const decision = text(form, 'decision', 10) as
          'APPROVE' | 'REJECT' | 'EDIT';
        if (
          !['APPROVE', 'REJECT', 'EDIT'].includes(decision) ||
          !canReview(workspace.role, decision)
        )
          throw new ValidationError(
            'Your workspace role cannot make this decision.',
          );
        const expected = text(form, 'expectedReviewId', 36) || null;
        await repository.review(
          itemId,
          expected,
          decision,
          text(form, 'rationale', 2000),
          decision === 'EDIT' ? text(form, 'title', 160) : null,
          decision === 'EDIT' ? text(form, 'statement', 4000) : null,
        );
      } else if (mode === 'ADD') {
        const analysis = analyses.find(
          (a) => a.id === validateId(form.get('analysisId')),
        );
        if (!analysis)
          throw new ValidationError('This analysis is unavailable.');
        const kind = text(form, 'kind', 20) as QaProposal['kind'];
        if (!['REQUIREMENT', 'RISK'].includes(kind))
          throw new ValidationError('Invalid proposal kind.');
        const nodeId = text(form, 'nodeId', 2000);
        const graph = (
          await createBehaviourGraphRepository(client).list(
            workspace.id,
            project.id,
            analysis.importId,
            analysis.graphId,
          )
        )[0];
        const node = graph?.graph.nodes.find((n) => n.id === nodeId);
        if (!node)
          throw new ValidationError(
            'Select evidence from this analysis graph.',
          );
        const category = text(form, 'category', 40);
        if (
          !(
            kind === 'REQUIREMENT' ? requirementCategories : riskCategories
          ).includes(category as never)
        )
          throw new ValidationError('Invalid category.');
        await repository.add(analysis.id, {
          logicalKey: `HUMAN_${crypto.randomUUID()}`,
          kind,
          title: text(form, 'title', 160),
          statement: text(form, 'statement', 4000),
          category,
          sourceKind: 'HUMAN_AUTHORED',
          derivationType: 'HUMAN',
          confidence: 'SUPPORTED',
          ruleId: 'HUMAN_PROPOSAL',
          reason: text(form, 'reason', 2000),
          sourcePointers: node.provenance.sourcePointers.slice(0, 30),
          nodeRefs: [node.id],
          edgeRefs: [],
          requirementRefs: [],
          severity:
            kind === 'RISK'
              ? (text(form, 'severity', 10) as QaProposal['severity'])
              : null,
          priority: kind === 'RISK' ? 'ROUTINE' : null,
        });
      } else throw new ValidationError('Invalid QA action.');
    }
  } catch (error) {
    return {
      error:
        error instanceof ValidationError || error instanceof PersistenceError
          ? error.message
          : 'Unable to analyze or review this API. Please try again.',
    };
  }
  revalidatePath('/requirements');
  revalidatePath('/risks');
  return { saved: true };
}
