import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  index: 0,
  result: {} as { saved?: number; error?: string },
  pending: false,
  effects: [] as (() => void)[],
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const n = h.index++;
    if (!(n in h.values)) h.values[n] = initial;
    return [
      h.values[n],
      (v: unknown) => {
        h.values[n] =
          typeof v === 'function'
            ? (v as (x: unknown) => unknown)(h.values[n])
            : v;
      },
    ];
  },
  useActionState: () => [h.result, vi.fn(), h.pending],
  useEffect: (effect: () => void) => {
    h.effects.push(effect);
  },
}));
vi.mock('../../lib/reviews/actions', () => ({ bulkReviewAction: vi.fn() }));
import { BulkReview } from './bulk-review';
import { bulkContextKey, selectedVisible } from '../../lib/reviews/bulk';
const rows = [
  {
    id: 'a',
    title: 'First',
    statement: 'Original statement',
    pending: true,
    expectedReviewId: null,
  },
  {
    id: 'b',
    title: 'Second',
    statement: 'Second statement',
    pending: true,
    expectedReviewId: null,
  },
  { id: 'c', title: 'Reviewed', pending: false, expectedReviewId: 'review' },
];
function elements(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...elements(value.props['children'])];
}
function render(items = rows, role = 'OWNER') {
  h.index = 0;
  return elements(
    BulkReview({
      family: 'QA',
      parentId: 'analysis',
      kind: 'REQUIREMENT',
      role,
      items,
      children: (checkbox) => (
        <>
          {items.map((i) => (
            <div key={i.id}>{checkbox(i.id)}</div>
          ))}
        </>
      ),
    }),
  );
}
function button(label: string, tree = render()) {
  return tree.find(
    (e) => e.type === 'button' && e.props['children'] === label,
  )!;
}
function click(label: string) {
  (button(label).props['onClick'] as () => void)();
}
beforeEach(() => {
  h.values = [];
  h.index = 0;
  h.result = {};
  h.pending = false;
  h.effects = [];
  vi.unstubAllGlobals();
});
it('only pending visible items have native keyboard-accessible checkboxes', () => {
  const tree = render();
  const inputs = tree.filter(
    (e) => e.type === 'input' && e.props['type'] === 'checkbox',
  );
  expect(inputs.map((e) => e.props['aria-label'])).toEqual([
    'Select First',
    'Select Second',
  ]);
  expect(tree.some((e) => e.type === 'form')).toBe(false);
  expect(selectedVisible(rows, ['a', 'c', 'hidden']).map((i) => i.id)).toEqual([
    'a',
  ]);
});
it('select all visible and deselect all never submit; approval needs explicit confirmation', () => {
  click('Select All Visible');
  expect(h.values[0]).toEqual(['a', 'b']);
  click('Approve selected');
  const tree = render();
  expect(
    tree.find((e) => e.type === 'input' && e.props['name'] === 'confirmed')
      ?.props['required'],
  ).toBe(true);
  const payload = JSON.parse(
    String(
      tree.find((e) => e.type === 'input' && e.props['name'] === 'items')
        ?.props['value'],
    ),
  );
  expect(payload.map((i: { id: string }) => i.id)).toEqual(['a', 'b']);
  click('Deselect All');
  expect(h.values[0]).toEqual([]);
});
it('approve all pending only includes current visible subset', () => {
  const tree = render(rows.slice(1));
  const all = tree.find(
    (e) =>
      e.type === 'button' &&
      String(e.props['children']).startsWith('Approve All Pending'),
  )!;
  (all.props['onClick'] as () => void)();
  expect(h.values[0]).toEqual(['b']);
  expect(h.values[1]).toBe('APPROVE');
});
it('rejection and request changes require reason, preserve edit drafts when switching decisions', () => {
  click('Select All Visible');
  click('Request changes for selected');
  let tree = render();
  expect(
    tree.find((e) => e.type === 'textarea' && e.props['name'] === 'rationale')
      ?.props['required'],
  ).toBe(true);
  const field = tree.find(
    (e) => e.type === 'textarea' && e.props['value'] === 'Original statement',
  )!;
  (field.props['onChange'] as (e: unknown) => void)({
    target: { value: 'Revised statement' },
  });
  click('Reject selected');
  tree = render();
  expect(tree.filter((e) => e.type === 'textarea')).toHaveLength(1);
  click('Request changes for selected');
  tree = render();
  expect(
    tree.some(
      (e) => e.type === 'textarea' && e.props['value'] === 'Revised statement',
    ),
  ).toBe(true);
});
it('permission filtering, pending lock, honest errors and bounded selection', () => {
  const member = render(rows, 'MEMBER');
  expect(
    member.some(
      (e) =>
        e.type === 'button' && String(e.props['children']).includes('Approve'),
    ),
  ).toBe(false);
  h.pending = true;
  expect(
    render()
      .filter((e) => e.type === 'input')
      .every((e) => e.props['disabled']),
  ).toBe(true);
  h.result = { error: 'Nothing changed. Reload.' };
  expect(render().some((e) => e.props['role'] === 'alert')).toBe(true);
});
it('revision/filter context keys differ and successful batches clear selection and refresh counts', () => {
  expect(bulkContextKey('a', 'CASE', rows)).not.toBe(
    bulkContextKey('a', 'SCENARIO', rows),
  );
  expect(bulkContextKey('a', 'CASE', rows)).not.toBe(
    bulkContextKey('a', 'CASE', [{ ...rows[0]!, expectedReviewId: 'new' }]),
  );
  click('Select All Visible');
  h.result = { saved: 2 };
  const reload = vi.fn();
  vi.stubGlobal('window', { location: { reload } });
  render();
  h.effects.at(-1)!();
  expect(h.values[0]).toEqual([]);
  expect(render().some((e) => e.props['role'] === 'status')).toBe(true);
});
