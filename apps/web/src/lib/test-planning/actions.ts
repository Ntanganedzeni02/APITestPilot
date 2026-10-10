'use server';
import { revalidatePath } from 'next/cache';
import {
  createTestPlanRepository,
  createQaRepository,
  createApiKnowledgeRepository,
  createBehaviourGraphRepository,
  PersistenceError,
} from '@testpilot/database';
import { AiReasoningError } from '@testpilot/ai/server';
import {
  AiValidationError,
  groundedPlanningCatalog,
  validateGroundedPlanning,
} from '@testpilot/ai';
import { runAiReasoning } from '../ai/reasoning';
import { generateTestPlan } from '@testpilot/test-engine';
import {
  validateId,
  canReview,
  reviewState,
  ValidationError,
} from '@testpilot/domain';
import { requireUser } from '../auth/server';
import { getTenantContext } from '../tenancy/context';
export interface PlanningActionState {
  error?: string;
  saved?: boolean;
  planId?: string;
  analysisId?: string;
}
export async function planningAction(
  _previous: PlanningActionState,
  form: FormData,
): Promise<PlanningActionState> {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project) return { error: 'Select a project first.' };
  const text = (key: string, max: number) => {
    const v = form.get(key);
    if (typeof v !== 'string' || v.length > max)
      throw new ValidationError('Invalid bounded input.');
    return v;
  };
  try {
    const repository = createTestPlanRepository(client);
    if (form.get('mode') === 'GENERATE' || form.get('mode') === 'GENERATE_AI') {
      const analysisId = validateId(form.get('analysisId'));
      const analysis = (
        await createQaRepository(client).list(workspace.id, project.id)
      ).find((a) => a.id === analysisId);
      if (!analysis)
        throw new ValidationError('Selected analysis unavailable.');
      const source = (
        await createApiKnowledgeRepository(client).list(
          workspace.id,
          project.id,
          analysis.importId,
        )
      )[0];
      const snapshot = (
        await createBehaviourGraphRepository(client).list(
          workspace.id,
          project.id,
          analysis.importId,
          analysis.graphId,
        )
      )[0];
      if (!source || !snapshot)
        throw new ValidationError('Pinned source unavailable.');
      const context = { analysis, source, snapshot };
      if (form.get('mode') === 'GENERATE_AI') {
        if (
          !analysis.records.some(
            (r) =>
              r.kind === 'REQUIREMENT' && reviewState(r).status === 'APPROVED',
          )
        )
          throw new ValidationError(
            'AI generation unavailable: approve requirements for this analysis in Requirements, or select an approved analysis.',
          );
        const catalog = groundedPlanningCatalog(context);
        const planId = await runAiReasoning(
          client,
          {
            projectId: project.id,
            sourceId: source.id,
            workflow: 'PLANNING',
            anchorId: analysis.id,
          },
          catalog.request.data,
          async (provider, cancellation) => {
            let failure: unknown;
            const plan = await generateTestPlan(
              context,
              {
                providerId: provider.providerId,
                modelId: provider.modelId,
                async plan(_request, signal) {
                  try {
                    const raw = await provider.plan(
                      catalog.request,
                      AbortSignal.any([signal, cancellation]),
                    );
                    validateGroundedPlanning(raw, catalog);
                    return raw;
                  } catch (error) {
                    failure = error;
                    throw error;
                  }
                },
              },
              30000,
            );
            if (
              plan.aiStatus !== 'SUCCEEDED' ||
              !plan.items.some((i) => i.origin === 'AI_PROPOSED')
            )
              throw failure instanceof AiReasoningError
                ? failure
                : new AiReasoningError(
                    'VALIDATION',
                    failure instanceof AiValidationError
                      ? failure.diagnostic
                      : new AiValidationError('PLAN', 'PLAN_RESULT_REJECTED')
                          .diagnostic,
                  );
            return plan;
          },
        );
        revalidatePath('/tests');
        return { saved: true, planId, analysisId: analysis.id };
      } else {
        const planId = await repository.save(await generateTestPlan(context));
        revalidatePath('/tests');
        return { saved: true, planId, analysisId: analysis.id };
      }
    } else if (form.get('mode') === 'ADD') {
      const plans = await repository.list(workspace.id, project.id);
      const plan = plans.find((p) => p.id === validateId(form.get('planId')));
      if (!plan) throw new ValidationError('Plan unavailable.');
      const kind = text('kind', 10);
      if (!['SCENARIO', 'CASE'].includes(kind))
        throw new ValidationError('Unknown planning kind.');
      const template = plan.records.find(
        (i) =>
          i.kind === 'SCENARIO' && i.logicalKey === text('scenarioKey', 2000),
      );
      if (!template)
        throw new ValidationError('Traceability template unavailable.');
      const {
        id: _id,
        planId: _planId,
        createdAt: _createdAt,
        createdBy: _createdBy,
        reviews: _reviews,
        ...definition
      } = template;
      void _id;
      void _planId;
      void _createdAt;
      void _createdBy;
      void _reviews;
      await repository.add(plan.id, {
        ...definition,
        logicalKey: 'HUMAN:' + crypto.randomUUID(),
        kind: kind as 'SCENARIO' | 'CASE',
        scenarioKey: kind === 'CASE' ? template.logicalKey : null,
        caseType: kind === 'CASE' ? 'CUSTOM' : null,
        title: text('title', 160),
        objective: text('objective', 4000),
        expectedBehavior: text('expectedBehavior', 4000),
        reason: text('reason', 2000),
        origin: 'HUMAN_AUTHORED',
        derivationType: 'HUMAN',
        confidence: 'SUPPORTED',
        ruleId: 'TEST_HUMAN_PROPOSAL',
        executable: false,
        input: { strategy: 'HUMAN_REVIEW_CONCEPT', pointer: null, value: null },
        preconditions: [],
      });
    } else if (form.get('mode') === 'REVIEW') {
      const itemId = validateId(form.get('itemId'));
      const plans = await repository.list(workspace.id, project.id);
      if (!plans.some((p) => p.records.some((i) => i.id === itemId)))
        throw new ValidationError('Proposal unavailable.');
      const decision = text('decision', 10) as 'APPROVE' | 'REJECT' | 'EDIT';
      if (
        !['APPROVE', 'REJECT', 'EDIT'].includes(decision) ||
        !canReview(workspace.role, decision)
      )
        throw new ValidationError('Your role cannot record this decision.');
      await repository.review(
        itemId,
        text('expectedReviewId', 36) || null,
        decision,
        text('rationale', 2000),
        decision === 'EDIT' ? text('title', 160) : null,
        decision === 'EDIT' ? text('objective', 4000) : null,
        decision === 'EDIT' ? text('expectedBehavior', 4000) : null,
      );
    } else throw new ValidationError('Unknown planning action.');
    revalidatePath('/tests');
    return { saved: true };
  } catch (error) {
    return {
      error:
        error instanceof AiReasoningError
          ? error.message
          : error instanceof PersistenceError
            ? error.message
            : error instanceof ValidationError
              ? error.message
              : 'Test planning is unavailable. Please try again.',
    };
  }
}
