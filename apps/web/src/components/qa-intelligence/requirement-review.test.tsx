import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  state: {} as { error?: string; saved?: boolean },
  pending: false,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.cursor++;
    if (!(i in h.values)) h.values[i] = initial;
    return [
      h.values[i],
      (value: unknown) => {
        h.values[i] = value;
      },
    ];
  },
  useActionState: () => [h.state, () => {}, h.pending],
}));
vi.mock('../../lib/qa-intelligence/actions', () => ({ qaAction: vi.fn() }));
import { RequirementReview } from './requirement-review';
import { RequirementCard } from './requirements-view';
import { QaActionForm } from './action-form';
import { requirement, snapshot } from './requirements.test-fixture';
function elements(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...elements(value.props['children'])];
}
function render<T>(fn: () => T) {
  h.cursor = 0;
  return fn();
}
beforeEach(() => {
  h.values = [];
  h.cursor = 0;
  h.state = {};
  h.pending = false;
});
it('approval requires an explicit confirmation and edit fields remain mounted but hidden and disabled', () => {
  let tree = render(() =>
    RequirementReview({ item: requirement, role: 'OWNER' }),
  );
  expect(tree.props['label']).toBe('Confirm approval');
  const fields = elements(tree).find(
    (e) => e.type === 'fieldset' && 'hidden' in e.props,
  )!;
  expect(fields.props['hidden']).toBe(true);
  expect(fields.props['disabled']).toBe(true);
  const radio = elements(tree).find(
    (e) => e.type === 'input' && e.props['value'] === 'EDIT',
  )!;
  (radio.props['onChange'] as () => void)();
  tree = render(() => RequirementReview({ item: requirement, role: 'OWNER' }));
  expect(tree.props['label']).toBe('Confirm changes');
  const editing = elements(tree).find(
    (e) => e.type === 'fieldset' && 'hidden' in e.props,
  )!;
  expect(editing.props['hidden']).toBe(false);
  expect(editing.key).toBe(fields.key);
  expect(
    elements(editing).find((e) => e.props['name'] === 'title')!.props[
      'defaultValue'
    ],
  ).toBe(requirement.title);
  expect(
    elements(editing).find((e) => e.props['name'] === 'statement')!.props[
      'defaultValue'
    ],
  ).toBe(requirement.statement);
  const reject = elements(tree).find(
    (e) => e.type === 'input' && e.props['value'] === 'REJECT',
  )!;
  (reject.props['onChange'] as () => void)();
  tree = render(() => RequirementReview({ item: requirement, role: 'OWNER' }));
  expect(tree.props['label']).toBe('Confirm rejection');
  expect(
    elements(tree).find((e) => e.type === 'fieldset' && 'hidden' in e.props)!
      .key,
  ).toBe(editing.key);
});
it('members can request changes but cannot approve or reject and expected version is preserved', () => {
  const tree = render(() =>
    RequirementReview({ item: requirement, role: 'MEMBER' }),
  );
  const decisions = elements(tree)
    .filter((e) => e.props['name'] === 'decision')
    .map((e) => e.props['value']);
  expect(decisions).toEqual(['EDIT']);
  expect(
    elements(tree).find((e) => e.props['name'] === 'itemId')!.props['value'],
  ).toBe(requirement.id);
  expect(
    elements(tree).find((e) => e.props['name'] === 'expectedReviewId')!.props[
      'value'
    ],
  ).toBe('');
  expect(
    elements(tree).find((e) => e.props['name'] === 'rationale')!.props[
      'maxLength'
    ],
  ).toBe(2000);
  expect(
    elements(tree).find((e) => e.props['name'] === 'rationale')!.props[
      'required'
    ],
  ).toBeUndefined();
});
it('expanded cards separate requirement, reason, traceability and history without exposing raw IDs', () => {
  let tree = render(() =>
    RequirementCard({
      item: requirement,
      graph: snapshot,
      role: 'OWNER',
      number: 1,
    }),
  );
  (tree.props['onToggle'] as (e: unknown) => void)({
    currentTarget: { open: true },
  });
  tree = render(() =>
    RequirementCard({
      item: requirement,
      graph: snapshot,
      role: 'OWNER',
      number: 1,
    }),
  );
  const html = renderToStaticMarkup(tree);
  for (const label of [
    'Why it exists',
    'Evidence / Traceability',
    'Review history',
    'No reviews recorded',
    'Confirm approval',
    'Approval never authorizes API execution',
  ])
    expect(html).toContain(label);
  expect(html.replace(/<[^>]*>/g, '')).not.toContain(requirement.id);
});
it('saved/error feedback is readable and pending forms cannot be submitted normally', () => {
  h.state = { saved: true };
  let html = renderToStaticMarkup(
    <QaActionForm
      label="Confirm approval"
      successMessage="Review recorded"
      children={<p>Fixture</p>}
    />,
  );
  expect(html).toContain('role="status"');
  expect(html).toContain('Review recorded');
  h.state = {
    error: 'This proposal changed. Reload before recording another review.',
  };
  h.pending = true;
  html = renderToStaticMarkup(
    <QaActionForm label="Confirm approval" children={<p>Fixture</p>} />,
  );
  expect(html).toContain('role="alert"');
  expect(html).toContain('Reload');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('disabled');
});
