import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
const m = vi.hoisted(() => ({
  sets: Array.from({ length: 7 }, () => vi.fn()),
  index: 0,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const index = m.index++;
    return [index === 1 ? 'APPROVED' : initial, m.sets[index]];
  },
}));
vi.mock('./action-form', () => ({ PlanningActionForm: () => null }));
import { FiltersPanel } from '../ui/filters-panel';
import { PlanningView } from './planning-view';
import type { TestPlan, GraphSnapshot } from '@testpilot/domain';
const plan = {
  id: 'plan',
  analysisId: 'analysis',
  records: [],
  requirements: [],
  status: 'DRAFT',
  aiStatus: 'NOT_CONFIGURED',
  createdAt: '2026-10-08T00:00:00Z',
} as unknown as TestPlan;
const graph = { graph: { nodes: [], edges: [] } } as unknown as GraphSnapshot;
beforeEach(() => {
  m.index = 0;
  m.sets.forEach((fn) => fn.mockReset());
});
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (node && typeof node === 'object' && 'props' in node) {
    const element = node as ReactElement<{ children: ReactNode }>;
    return [
      element as ReactElement<Record<string, unknown>>,
      ...elements(element.props['children']),
    ];
  }
  return [];
}
function view() {
  return elements(PlanningView({ plan, graph, role: 'OWNER' }));
}
it('Clear filters restores every filter without generating a plan', () => {
  const panel = view().find((element) => element.type === FiltersPanel)!;
  expect(panel.props['activeCount']).toBe(1);
  (panel.props['onClear'] as () => void)();
  for (const index of [1, 2, 3, 4, 6])
    expect(m.sets[index]).toHaveBeenCalledWith('ALL');
  expect(m.sets[5]).toHaveBeenCalledWith('');
});
it('keyboard arrow advances tab and moves focus', () => {
  const tab = view().find((element) => element.props['role'] === 'tab')!;
  const focus = vi.fn(),
    preventDefault = vi.fn();
  (tab.props['onKeyDown'] as (e: unknown) => void)({
    key: 'ArrowRight',
    preventDefault,
    currentTarget: {
      parentElement: { querySelectorAll: () => [{}, { focus }, {}, {}] },
    },
  });
  expect(m.sets[0]).toHaveBeenCalledWith('CASE');
  expect(focus).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce();
});
