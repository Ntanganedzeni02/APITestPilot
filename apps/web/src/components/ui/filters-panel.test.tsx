import { expect, it, vi, beforeEach } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const h = vi.hoisted(() => ({ open: false }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: () => [
    h.open,
    (value: boolean) => {
      h.open = value;
    },
  ],
  useId: () => 'filters-test',
}));
import { FiltersPanel, activeFilterCount } from './filters-panel';
function elements(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...elements(value.props['children'])];
}
beforeEach(() => {
  h.open = false;
});
it('default values are not active and distinct empty defaults are respected', () => {
  expect(
    activeFilterCount([
      { value: 'ALL', defaultValue: 'ALL' },
      { value: '', defaultValue: '' },
    ]),
  ).toBe(0);
  expect(
    activeFilterCount([
      { value: 'APPROVED', defaultValue: 'ALL' },
      { value: 'reference', defaultValue: '' },
    ]),
  ).toBe(2);
});
it('collapsed panel keeps the same children mounted across keyboard-accessible toggles and never clears on toggle', () => {
  const onClear = vi.fn(),
    children = <input defaultValue="retained draft" />;
  const render = () =>
    FiltersPanel({ children, activeCount: 2, onClear, label: 'Test filters' });
  let tree = render();
  let controls = elements(tree);
  let button = controls.find((e) => e.type === 'button')!;
  expect(button.props['type']).toBe('button');
  expect(button.props['aria-expanded']).toBe(false);
  expect(
    controls.find((e) => e.props['role'] === 'region')!.props['hidden'],
  ).toBe(true);
  expect(renderToStaticMarkup(tree)).toContain('Filters (2)');
  const input = controls.find((e) => e.type === 'input')!;
  (button.props['onClick'] as () => void)();
  tree = render();
  controls = elements(tree);
  expect(
    controls.find((e) => e.props['role'] === 'region')!.props['hidden'],
  ).toBe(false);
  expect(controls.find((e) => e.type === 'input')).toBe(input);
  button = controls.find((e) => e.type === 'button')!;
  (button.props['onClick'] as () => void)();
  tree = render();
  expect(elements(tree).find((e) => e.type === 'input')).toBe(input);
  expect(onClear).not.toHaveBeenCalled();
  const clear = elements(tree).find(
    (e) => e.type === 'button' && e.props['children'] === 'Clear filters',
  )!;
  (clear.props['onClick'] as () => void)();
  expect(onClear).toHaveBeenCalledOnce();
  expect(button.props['aria-controls']).toBe('filters-test');
});
