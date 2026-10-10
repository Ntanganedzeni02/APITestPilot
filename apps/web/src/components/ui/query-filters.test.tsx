import { expect, it, vi, beforeEach } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  index: 0,
  push: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = h.index++;
    if (!(index in h.values))
      h.values[index] =
        typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [
      h.values[index],
      (value: unknown) => {
        h.values[index] = value;
      },
    ];
  },
}));
import { QueryFilters } from './query-filters';
import { FiltersPanel } from './filters-panel';
function elements(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...elements(value.props['children'])];
}
beforeEach(() => {
  h.values = [];
  h.index = 0;
  h.push.mockReset();
  vi.unstubAllGlobals();
});
it('Memory filters count only predicates, retain changes and clear while preserving selected environment and other query context', () => {
  const props = {
    fields: [
      { name: 'kind', label: 'Type', value: 'ASSERTION' },
      { name: 'currentness', label: 'Currentness', value: '' },
    ],
    environment: {
      id: 'development',
      options: [
        { value: 'development', label: 'Development' },
        { value: 'staging', label: 'Staging' },
      ],
    },
    query: {
      kind: 'ASSERTION',
      page: '2',
      environment: 'development',
      context: 'retained',
    },
  };
  const render = () => {
    h.index = 0;
    return QueryFilters(props);
  };
  let tree = render();
  let panel = elements(tree).find((e) => e.type === FiltersPanel)!;
  expect(panel.props['activeCount']).toBe(1);
  const environment = elements(tree).find(
    (e) => e.props['name'] === 'environment',
  )!;
  (environment.props['onChange'] as (e: unknown) => void)({
    target: { value: 'staging' },
  });
  const currentness = elements(tree).find(
    (e) => e.props['name'] === 'currentness',
  )!;
  (currentness.props['onChange'] as (e: unknown) => void)({
    target: { value: 'RECENT' },
  });
  tree = render();
  panel = elements(tree).find((e) => e.type === FiltersPanel)!;
  expect(panel.props['activeCount']).toBe(2);
  expect(
    elements(tree).find((e) => e.props['name'] === 'currentness')!.props[
      'value'
    ],
  ).toBe('RECENT');
  vi.stubGlobal('window', { location: { pathname: '/memory' } });
  (panel.props['onClear'] as () => void)();
  tree = render();
  expect(h.push).toHaveBeenCalledWith(
    '/memory?environment=staging&context=retained',
  );
  expect(
    elements(tree).find((e) => e.type === FiltersPanel)!.props['activeCount'],
  ).toBe(0);
});
