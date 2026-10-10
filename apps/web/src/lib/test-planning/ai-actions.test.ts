import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  tenant: vi.fn(),
  user: vi.fn(),
  analyses: vi.fn(),
  sources: vi.fn(),
  graphs: vi.fn(),
  reasoning: vi.fn(),
  save: vi.fn(),
  plans: vi.fn(),
  review: vi.fn(),
}));
vi.mock('../auth/server', () => ({ requireUser: m.user }));
vi.mock('../tenancy/context', () => ({ getTenantContext: m.tenant }));
vi.mock('../ai/reasoning', () => ({ runAiReasoning: m.reasoning }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@testpilot/database', async (original) => ({
  ...(await original<typeof import('@testpilot/database')>()),
  createTestPlanRepository: () => ({
    save: m.save,
    list: m.plans,
    review: m.review,
  }),
  createQaRepository: () => ({ list: m.analyses }),
  createApiKnowledgeRepository: () => ({ list: m.sources }),
  createBehaviourGraphRepository: () => ({ list: m.graphs }),
}));
import { context } from '../../../../../packages/ai/tests/planning-fixture.js';
import { planningAction } from './actions';
import { AiReasoningError } from '@testpilot/ai/server';
beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  const c = context();
  m.user.mockResolvedValue({ client: {} });
  m.tenant.mockResolvedValue({
    workspace: { id: c.source.workspaceId, role: 'OWNER' },
    project: { id: c.source.projectId },
  });
  m.analyses.mockResolvedValue([c.analysis]);
  m.sources.mockResolvedValue([c.source]);
  m.graphs.mockResolvedValue([c.snapshot]);
});
function form() {
  const f = new FormData();
  f.set('mode', 'GENERATE_AI');
  f.set('analysisId', context().analysis.id);
  return f;
}
it('rejects unavailable tenant/analysis before AI admission', async () => {
  m.analyses.mockResolvedValue([]);
  expect(await planningAction({}, form())).toHaveProperty('error');
  expect(m.reasoning).not.toHaveBeenCalled();
});
it('passes grounded scope and persists only validated pending AI items', async () => {
  m.reasoning.mockImplementation(async (_client, scope, data, build) => {
    expect(scope).toMatchObject({
      projectId: context().source.projectId,
      workflow: 'PLANNING',
      anchorId: context().analysis.id,
    });
    const output = {
      proposals: [
        {
          key: 'ai-scenario',
          scenarioRef: null,
          title: 'Review declared boundary',
          objective: 'Review declared constraints',
          testType: 'CONTRACT',
          caseType: null,
          requirementRefs: [data.requirements[0].token],
          riskRefs: [],
          evidenceRefs: [data.operations[0].token],
          reason: 'Declared requirement needs coverage',
          expectedBehavior: 'Use declared constraints',
          preconditions: ['APPROVED_TEST_DATA'],
          requestIntent: 'Review before execution',
        },
      ],
    };
    const plan = await build(
      {
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
        plan: vi.fn().mockResolvedValue(output),
      },
      new AbortController().signal,
    );
    expect(plan.aiStatus).toBe('SUCCEEDED');
    expect(
      plan.items
        .filter((item: { origin: string }) => item.origin === 'AI_PROPOSED')
        .every((item: { executable: boolean }) => item.executable === false),
    ).toBe(true);
    return '16000000-0000-0000-0000-000000009999';
  });
  expect(await planningAction({}, form())).toMatchObject({
    saved: true,
    analysisId: context().analysis.id,
  });
  expect(m.save).not.toHaveBeenCalled();
});
it('provider failure produces clear safe error without saving deterministic fallback as AI', async () => {
  m.reasoning.mockRejectedValue(new AiReasoningError('CREDITS'));
  expect(await planningAction({}, form())).toEqual({
    error: 'AI provider credits are unavailable.',
  });
  expect(m.save).not.toHaveBeenCalled();
});

it('zero-approved analysis is rejected visibly before admission', async () => {
  const c = context();
  m.analyses.mockResolvedValue([
    {
      ...c.analysis,
      records: c.analysis.records.map((r) => ({ ...r, reviews: [] })),
    },
  ]);
  expect(await planningAction({}, form())).toEqual({
    error:
      'AI generation unavailable: approve requirements for this analysis in Requirements, or select an approved analysis.',
  });
  expect(m.reasoning).not.toHaveBeenCalled();
  expect(m.save).not.toHaveBeenCalled();
});
it('stale submitted analysis never falls back to newest available analysis', async () => {
  m.analyses.mockResolvedValue([
    { ...context().analysis, id: '16000000-0000-0000-0000-000000000099' },
  ]);
  expect(await planningAction({}, form())).toEqual({
    error: 'Selected analysis unavailable.',
  });
  expect(m.reasoning).not.toHaveBeenCalled();
});

it.each(['APPROVE', 'EDIT', 'REJECT'])(
  'explicit %s review preserves backend semantics',
  async (decision) => {
    const id = context().analysis.id;
    m.plans.mockResolvedValue([{ records: [{ id }] }]);
    const f = new FormData();
    Object.entries({
      mode: 'REVIEW',
      itemId: id,
      expectedReviewId: '',
      decision,
      rationale: 'Review rationale',
      title: 'Revised title',
      objective: 'Revised objective',
      expectedBehavior: 'Revised expected',
    }).forEach(([k, v]) => f.set(k, v));
    expect(await planningAction({}, f)).toEqual({ saved: true });
    expect(m.review).toHaveBeenCalledWith(
      id,
      null,
      decision,
      'Review rationale',
      decision === 'EDIT' ? 'Revised title' : null,
      decision === 'EDIT' ? 'Revised objective' : null,
      decision === 'EDIT' ? 'Revised expected' : null,
    );
  },
);
it('oversized rationale is rejected before persistence', async () => {
  const id = context().analysis.id;
  m.plans.mockResolvedValue([{ records: [{ id }] }]);
  const f = new FormData();
  Object.entries({
    mode: 'REVIEW',
    itemId: id,
    expectedReviewId: '',
    decision: 'APPROVE',
    rationale: 'x'.repeat(2001),
  }).forEach(([k, v]) => f.set(k, v));
  expect(await planningAction({}, f)).toHaveProperty(
    'error',
    'Invalid bounded input.',
  );
  expect(m.review).not.toHaveBeenCalled();
});

it('Standard generation returns the saved plan and exact analysis for navigation without calling AI', async () => {
  const c = context(),
    f = new FormData();
  f.set('mode', 'GENERATE');
  f.set('analysisId', c.analysis.id);
  m.save.mockResolvedValue('16000000-0000-0000-0000-000000009999');
  expect(await planningAction({}, f)).toEqual({
    saved: true,
    planId: '16000000-0000-0000-0000-000000009999',
    analysisId: c.analysis.id,
  });
  expect(m.save).toHaveBeenCalledWith(
    expect.objectContaining({
      analysisId: c.analysis.id,
      requirements: expect.arrayContaining([
        expect.objectContaining({ status: 'APPROVED' }),
      ]),
    }),
  );
  expect(m.reasoning).not.toHaveBeenCalled();
});

it('AI success returns the persisted plan and selected analysis for navigation', async () => {
  const c = context(),
    planId = '16000000-0000-0000-0000-000000009999';
  m.reasoning.mockResolvedValue(planId);
  expect(await planningAction({}, form())).toEqual({
    saved: true,
    planId,
    analysisId: c.analysis.id,
  });
  expect(m.save).not.toHaveBeenCalled();
});
