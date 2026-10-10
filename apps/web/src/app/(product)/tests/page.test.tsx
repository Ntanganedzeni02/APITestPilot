import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
const m = vi.hoisted(() => ({
  analyses: vi.fn(),
  plans: vi.fn(),
  graphs: vi.fn(),
  sources: vi.fn(),
  tenant: vi.fn(),
  push: vi.fn(),
  view: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('../../../lib/auth/server', () => ({
  requireUser: async () => ({ client: {} }),
}));
vi.mock('../../../lib/tenancy/context', () => ({ getTenantContext: m.tenant }));
vi.mock('@testpilot/database', () => ({
  createQaRepository: () => ({ list: m.analyses }),
  createTestPlanRepository: () => ({ list: m.plans }),
  createBehaviourGraphRepository: () => ({ list: m.graphs }),
  createApiKnowledgeRepository: () => ({ list: m.sources }),
}));
vi.mock('../../../components/test-planning/planning-view', () => ({
  PlanningView: (props: { initialView?: string; analysisName?: string }) => {
    m.view(props);
    return <p>Plan contents</p>;
  },
}));
vi.mock('../../../components/test-planning/action-form', () => ({
  PlanningActionForm: ({
    children,
    label,
    disabled,
  }: {
    children: ReactNode;
    label: string;
    disabled?: boolean;
  }) => (
    <form>
      {children}
      <button disabled={disabled}>{label}</button>
    </form>
  ),
}));
import TestStudio from './page';
import { context } from '../../../../../../packages/ai/tests/planning-fixture';
const c = context(),
  approved = c.analysis;
const newer = {
  ...approved,
  id: '16000000-0000-0000-0000-000000000099',
  records: approved.records.map((r) => ({ ...r, reviews: [] })),
};
const plan = {
  id: '16000000-0000-0000-0000-000000000088',
  analysisId: approved.id,
  importId: approved.importId,
  graphId: approved.graphId,
  createdAt: '2026-10-08T11:00:00Z',
  status: 'DRAFT',
  aiStatus: 'NOT_CONFIGURED',
  requirements: approved.records
    .filter((r) => r.kind === 'REQUIREMENT')
    .map((r) => ({ id: r.id, reviewId: r.reviews.at(-1)?.id ?? null })),
};
beforeEach(() => {
  vi.stubEnv('OPENAI_AI_ENABLED', 'false');
  m.tenant.mockResolvedValue({
    workspace: { id: approved.workspaceId, role: 'OWNER' },
    project: { id: approved.projectId },
  });
  m.analyses.mockResolvedValue([newer, approved]);
  m.plans.mockResolvedValue([]);
  m.graphs.mockResolvedValue([c.snapshot]);
  m.sources.mockResolvedValue([
    { ...c.source, knowledge: { ...c.source.knowledge, title: 'Catalog API' } },
  ]);
});
async function page(query: Record<string, string | string[]> = {}) {
  return renderToStaticMarkup(
    await TestStudio({ searchParams: Promise.resolve(query) }),
  );
}
it('readable direct URL selection preserves internal submission IDs', async () => {
  const html = await page({ analysis: approved.id });
  expect(html).toContain('Catalog API - Analysis');
  expect(html).toContain(`name="analysisId" value="${approved.id}"`);
  expect(html).not.toContain(`name="analysisId" value="${newer.id}"`);
  expect(html).toContain('Ready for planning');
  expect(html).toContain('Technical details');
  expect(html).not.toContain('Select analysis</button>');
});
it('zero-approved snapshot explains approval requirement and disables AI', async () => {
  const html = await page();
  expect(html).toContain('Approve requirements for this analysis');
  expect(html).toContain('<button disabled="">Generate with AI</button>');
  expect(html).toContain('Needs attention');
});
it('AI disabled state remains visible even for approved analysis', async () => {
  const html = await page({ analysis: approved.id });
  expect(html).toContain('AI is disabled for this server');
  expect(html).toContain('<button disabled="">Generate with AI</button>');
  expect(html).toContain('Create standard plan');
});
it('stale analysis fails closed without generation forms', async () => {
  const html = await page({ analysis: 'missing' });
  expect(html).toContain('Selected analysis is unavailable');
  expect(html).not.toContain('name="analysisId"');
});
it('repeated ambiguous IDs fail closed', async () => {
  expect(await page({ analysis: [approved.id, newer.id] })).toContain(
    'No fallback was selected',
  );
});
it('clickable history binds its own analysis and preserves stable IDs', async () => {
  m.plans.mockResolvedValue([plan]);
  const html = await page({ analysis: approved.id });
  expect(html).toContain(`/tests?analysis=${approved.id}&amp;plan=${plan.id}`);
  expect(html).toContain('Catalog API - Plan');
  expect(html).toContain('Draft');
  expect(html).not.toContain('View plan</button>');
  expect(html).toContain('aria-current="page"');
});
it('mismatched plan-to-analysis URL does not render the other analysis plan', async () => {
  m.plans.mockResolvedValue([plan]);
  const html = await page({ analysis: newer.id, plan: plan.id });
  expect(html).toContain('Selected plan is unavailable for this analysis');
  expect(html).not.toContain('Plan contents');
});
it('invalid plan does not silently choose a different plan', async () => {
  m.plans.mockResolvedValue([plan]);
  const html = await page({ analysis: approved.id, plan: 'missing' });
  expect(html).toContain('Selected plan is unavailable');
  expect(html).not.toContain('Plan contents');
});
it('plan-only links resolve recorded analysis rather than latest', async () => {
  m.plans.mockResolvedValue([plan]);
  const html = await page({ plan: plan.id });
  expect(html).toContain(`name="analysisId" value="${approved.id}"`);
  expect(html).toContain('Plan contents');
});
it('empty history offers planning guidance', async () => {
  expect(await page()).toContain('No test plans yet. Choose an analysis');
});

it('route passes readable associated analysis and deep-linked tab to review view', async () => {
  m.plans.mockResolvedValue([plan]);
  await page({ analysis: approved.id, plan: plan.id, view: 'TRACEABILITY' });
  expect(m.view).toHaveBeenLastCalledWith(
    expect.objectContaining({
      initialView: 'TRACEABILITY',
      analysisName: expect.stringContaining('Catalog API - Analysis'),
      title: expect.stringContaining('Catalog API - Plan'),
    }),
  );
});

it('stale requirement review snapshot blocks bulk review without hiding plan', async () => {
  m.plans.mockResolvedValue([{ ...plan, requirements: [] }]);
  await page({ analysis: approved.id, plan: plan.id });
  expect(m.view).toHaveBeenLastCalledWith(
    expect.objectContaining({
      bulkBlocked: expect.stringContaining('snapshot'),
    }),
  );
});
