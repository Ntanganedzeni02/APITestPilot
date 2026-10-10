import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const m = vi.hoisted(() => ({
  tenant: vi.fn(),
  imports: vi.fn(),
  analyses: vi.fn(),
  graphs: vi.fn(),
}));
vi.mock('../../lib/auth/server', () => ({
  requireUser: async () => ({ client: {} }),
}));
vi.mock('../../lib/tenancy/context', () => ({ getTenantContext: m.tenant }));
vi.mock('@testpilot/database', () => ({
  createApiKnowledgeRepository: () => ({ list: m.imports }),
  createQaRepository: () => ({ list: m.analyses }),
  createBehaviourGraphRepository: () => ({ list: m.graphs }),
}));
vi.mock('./context-select', () => ({ RequirementContextSelect: () => null }));
vi.mock('./requirements-view', () => ({ RequirementsView: () => null }));
vi.mock('./action-form', () => ({ QaActionForm: () => null }));
import { RequirementsPage } from './requirements-page';
import { RequirementsView } from './requirements-view';
import { analysis, source, snapshot } from './requirements.test-fixture';
function elements(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...elements(value.props['children'])];
}
beforeEach(() => {
  m.tenant.mockResolvedValue({
    workspace: { id: source.workspaceId, role: 'OWNER' },
    project: { id: source.projectId },
  });
  m.imports.mockResolvedValue([source]);
  m.analyses.mockResolvedValue([
    { ...analysis, id: '15000000-0000-0000-0000-000000000099' },
    analysis,
  ]);
  m.graphs.mockResolvedValue([snapshot]);
});
it('the selected analysis is preserved and its historical graph is read in the authenticated project scope', async () => {
  const tree = await RequirementsPage({ query: { analysis: analysis.id } });
  expect(m.analyses).toHaveBeenCalledWith(source.workspaceId, source.projectId);
  expect(m.graphs).toHaveBeenCalledWith(
    source.workspaceId,
    source.projectId,
    analysis.importId,
    analysis.graphId,
  );
  expect(
    elements(tree).find((e) => e.type === RequirementsView)!.props['analysis'],
  ).toBe(analysis);
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('Create an analysis');
  expect(html).not.toContain('View analysis');
  expect(html.replace(/<[^>]*>/g, '')).not.toContain(analysis.id);
});
it.each(['foreign-project-analysis', 'missing-analysis', '', ['one', 'two']])(
  'invalid analysis selection is visible and never silently replaced: %s',
  async (id) => {
    const tree = await RequirementsPage({ query: { analysis: id } });
    expect(renderToStaticMarkup(tree)).toContain('role="alert"');
    expect(elements(tree).some((e) => e.type === RequirementsView)).toBe(false);
    expect(m.graphs).not.toHaveBeenCalled();
  },
);
it('a foreign import is unavailable instead of being used as a source', async () => {
  m.imports.mockImplementation((_ws: string, _project: string, id?: string) =>
    Promise.resolve(id ? [] : [source]),
  );
  const tree = await RequirementsPage({
    query: { import: '15000000-0000-0000-0000-000000000088' },
  });
  expect(renderToStaticMarkup(tree)).toContain(
    'selected API import is unavailable',
  );
  expect(m.graphs).not.toHaveBeenCalled();
});
it('empty and missing-graph states preserve explicit create/import navigation', async () => {
  m.imports.mockResolvedValue([]);
  m.analyses.mockResolvedValue([]);
  m.graphs.mockResolvedValue([]);
  const tree = await RequirementsPage({ query: {} });
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('No requirements analysis yet');
  expect(html).toContain('Open API Map');
  expect(m.graphs).not.toHaveBeenCalled();
});

it('Risks reuse the selected authorized analysis and reject stale selections without fallback', async () => {
  const tree = await RequirementsPage({
    kind: 'RISK',
    query: { analysis: analysis.id },
  });
  const view = elements(tree).find((e) => e.type === RequirementsView)!;
  expect(view.props['kind']).toBe('RISK');
  expect(view.props['analysis']).toBe(analysis);
  expect(renderToStaticMarkup(tree)).toContain('Risks');
  const invalid = await RequirementsPage({
    kind: 'RISK',
    query: { analysis: 'foreign' },
  });
  expect(renderToStaticMarkup(invalid)).toContain('role="alert"');
  expect(elements(invalid).some((e) => e.type === RequirementsView)).toBe(
    false,
  );
});
