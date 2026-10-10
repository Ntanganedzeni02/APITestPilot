import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { parseApiSpec } from '@testpilot/api-spec';
const m = vi.hoisted(() => ({
  imports: vi.fn(),
  graphs: vi.fn(),
  tenant: vi.fn(),
  view: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('../../../lib/auth/server', () => ({
  requireUser: async () => ({ client: {} }),
}));
vi.mock('../../../lib/tenancy/context', () => ({ getTenantContext: m.tenant }));
vi.mock('@testpilot/database', async (original) => ({
  ...(await original<typeof import('@testpilot/database')>()),
  createApiKnowledgeRepository: () => ({ list: m.imports }),
  createBehaviourGraphRepository: () => ({ list: m.graphs }),
}));
vi.mock('../../../components/api-map/api-map-view', () => ({
  ApiMapView: () => null,
}));
vi.mock('../../../components/api-map/import-form', () => ({
  ImportForm: () => null,
}));
vi.mock('../../../components/behaviour-graph/build-form', () => ({
  GraphBuildForm: () => null,
}));
import ApiMap from './page';
const old = {
  id: '14000000-0000-0000-0000-000000000001',
  workspaceId: '14000000-0000-0000-0000-000000000002',
  projectId: '14000000-0000-0000-0000-000000000003',
  createdAt: '2026-10-08T11:14:00Z',
  createdBy: '14000000-0000-0000-0000-000000000004',
  knowledge: parseApiSpec(
    readFileSync('packages/api-spec/tests/fixtures/catalog.json', 'utf8'),
    'json',
  ).knowledge,
};
const newer = { ...old, id: '14000000-0000-0000-0000-000000000005' };
beforeEach(() => {
  m.tenant.mockResolvedValue({
    workspace: { id: old.workspaceId },
    project: { id: old.projectId, name: 'Fixture project' },
  });
  m.imports.mockResolvedValue([newer, old]);
  m.graphs.mockResolvedValue([]);
});
it('direct URL selects the requested import and loads graph in the same authorized scope', async () => {
  const tree = await ApiMap({
    searchParams: Promise.resolve({ import: old.id, view: 'graph' }),
  });
  expect(m.imports).toHaveBeenCalledWith(old.workspaceId, old.projectId);
  expect(m.graphs).toHaveBeenCalledWith(old.workspaceId, old.projectId, old.id);
  const child = tree.props.children.find(
    (c: unknown) =>
      typeof c === 'object' &&
      c !== null &&
      'props' in c &&
      c.props &&
      typeof c.props === 'object' &&
      'selected' in c.props,
  );
  expect(child.props.selected.id).toBe(old.id);
  expect(child.props.initialTab).toBe('graph');
});
it.each(['deleted-id', 'foreign-project-id', '', ['first', 'second']])(
  'rejects invalid, stale or cross-project selection instead of falling back: %s',
  async (id) => {
    await expect(
      ApiMap({ searchParams: Promise.resolve({ import: id }) }),
    ).rejects.toThrow('NOT_FOUND');
    expect(m.graphs).not.toHaveBeenCalled();
  },
);
it('missing selection uses latest authorized import and empty history never triggers writes', async () => {
  await ApiMap({ searchParams: Promise.resolve({}) });
  expect(m.graphs).toHaveBeenCalledWith(
    old.workspaceId,
    old.projectId,
    newer.id,
  );
  m.graphs.mockClear();
  m.imports.mockResolvedValue([]);
  await ApiMap({ searchParams: Promise.resolve({}) });
  expect(m.graphs).not.toHaveBeenCalled();
});
