import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  context: vi.fn(),
  current: vi.fn(),
  source: vi.fn(),
  imports: vi.fn(),
  analyses: vi.fn(),
  plans: vi.fn(),
  runs: vi.fn(),
}));
vi.mock('../../lib/memory-quality/context', () => ({
  intelligenceContext: m.context,
}));
vi.mock('../../lib/auth/server', () => ({
  requireUser: async () => ({ client: {} }),
}));
vi.mock('@testpilot/database', () => ({
  createApiKnowledgeRepository: () => ({ list: m.imports }),
  createQaRepository: () => ({ list: m.analyses }),
  createTestPlanRepository: () => ({ list: m.plans }),
  createExecutionRepository: () => ({ list: m.runs }),
}));
import Home from './page';
beforeEach(() => {
  vi.clearAllMocks();
  m.context.mockResolvedValue({
    workspace: { id: 'workspace', name: 'Fixture workspace' },
    project: { id: 'project', name: 'Fixture project' },
    environment: { id: 'development', type: 'DEVELOPMENT' },
    repo: { current: m.current, latestSource: m.source },
  });
  m.current.mockResolvedValue({ current: null });
  m.source.mockResolvedValue(null);
  for (const fn of [m.imports, m.analyses, m.plans, m.runs])
    fn.mockResolvedValue([]);
});
it('uses authorized project scope and excludes other environments from run summaries', async () => {
  m.runs.mockResolvedValue([
    {
      id: 'local-run',
      environment_id: 'development',
      created_at: '2026-10-08T12:00:00Z',
    },
    {
      id: 'production-run',
      environment_id: 'production',
      created_at: '2026-10-08T13:00:00Z',
    },
  ]);
  const result = await Home();
  for (const fn of [m.imports, m.analyses, m.plans, m.runs, m.source])
    expect(fn).toHaveBeenCalledWith('workspace', 'project');
  expect(m.current).toHaveBeenCalledWith('workspace', 'project', 'development');
  expect(result.props.data.runs).toBe(1);
  expect(result.props.data.activity.map((a: { id: string }) => a.id)).toEqual([
    'local-run',
  ]);
  expect(result.props.data.current).toBeNull();
  expect(result.props.data.planCoverage).toBeNull();
});
it('reports failed reads as unavailable rather than inventing empty evidence', async () => {
  m.current.mockRejectedValue(new Error('fixture unavailable'));
  m.runs.mockRejectedValue(new Error('fixture unavailable'));
  const result = await Home();
  expect(result.props.data.qualityUnavailable).toBe(true);
  expect(result.props.data.runs).toBeNull();
  expect(result.props.data.activityUnavailable).toBe(true);
  expect(result.props.data.current).toBeNull();
});
