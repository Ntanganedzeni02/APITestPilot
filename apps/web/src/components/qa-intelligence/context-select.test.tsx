import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useTransition: () => [false, (fn: () => void) => fn()],
}));
import { RequirementContextSelect } from './context-select';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: {
      href: 'http://127.0.0.1:3000/requirements?analysis=old&import=old-source',
    },
  }),
);
function select(
  tree: unknown,
): ReactElement<{ onChange: (e: unknown) => void }> {
  if (!isValidElement<{ children: unknown }>(tree))
    throw new Error('Invalid fixture');
  return (tree.props.children as unknown[]).find(
    (e) => isValidElement(e) && e.type === 'select',
  ) as ReactElement<{ onChange: (e: unknown) => void }>;
}
const options = [
  {
    id: 'approved-analysis',
    label: 'Catalog API - Analysis A',
    createdAt: '2026-10-09T11:14:00Z',
  },
];
it('analysis selection applies immediately, retains stable IDs and removes a stale generation source', () => {
  const tree = RequirementContextSelect({
    parameter: 'analysis',
    label: 'Choose analysis',
    selectedId: 'approved-analysis',
    options,
  });
  select(tree).props.onChange({
    currentTarget: { value: 'approved-analysis' },
  });
  expect(push).toHaveBeenCalledWith('/requirements?analysis=approved-analysis');
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('Choose analysis');
  expect(html).toContain('value="approved-analysis"');
  expect(html).not.toContain('<button');
});
it('source selection does not replace the selected review analysis and unknown options do not navigate', () => {
  const tree = RequirementContextSelect({
    parameter: 'import',
    label: 'Specification to analyze',
    selectedId: 'approved-analysis',
    options,
  });
  select(tree).props.onChange({
    currentTarget: { value: 'approved-analysis' },
  });
  expect(push).toHaveBeenCalledWith(
    '/requirements?analysis=old&import=approved-analysis',
  );
  push.mockClear();
  select(tree).props.onChange({ currentTarget: { value: 'foreign' } });
  expect(push).not.toHaveBeenCalled();
});
