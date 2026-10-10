import { expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useTransition: () => [false, (fn: () => void) => fn()],
}));
import { AnalysisSelect } from './analysis-select';
const props = {
  selectedId: 'old',
  options: [
    { id: 'old', label: 'Catalog API - Analysis A' },
    { id: 'approved', label: 'Catalog API - Analysis B' },
  ],
};
it('changing analysis immediately navigates, without a generation action or submit button', () => {
  const element = AnalysisSelect(props);
  const select = (
    element.props.children as ReactElement<{
      onChange: (event: unknown) => void;
    }>[]
  ).find((child) => child?.type === 'select')!;
  select.props.onChange({ currentTarget: { value: 'approved' } });
  expect(push).toHaveBeenCalledWith('/tests?analysis=approved');
  expect(renderToStaticMarkup(element)).not.toContain('<button');
});
it('selector has native keyboard behavior, readable labels and stable values', () => {
  const html = renderToStaticMarkup(<AnalysisSelect {...props} />);
  expect(html).toContain('aria-label="Analysis"');
  expect(html).toContain('value="approved"');
  expect(html).toContain('Catalog API');
  expect(html).toContain('focus-visible');
});
