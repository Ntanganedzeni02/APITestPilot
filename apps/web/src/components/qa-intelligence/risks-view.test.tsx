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
  useId: () => 'risk-filters',
  useActionState: () => [h.state, () => {}, h.pending],
}));
vi.mock('../../lib/qa-intelligence/actions', () => ({ qaAction: vi.fn() }));
import { FiltersPanel } from '../ui/filters-panel';
import { RequirementReview } from './requirement-review';
import { RequirementsView, RequirementCard } from './requirements-view';
import {
  requirementCounts,
  filterRequirements,
} from './requirement-presentation';
import { analysis, snapshot } from './requirements.test-fixture';
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

const risk = analysis.records.find((i) => i.kind === 'RISK')!;
function view() {
  return render(() =>
    RequirementsView({
      analysis,
      graph: snapshot,
      role: 'OWNER',
      kind: 'RISK',
    }),
  );
}
it.each(['RISK', 'REQUIREMENT'] as const)(
  '%s panel counts categorical selections, excludes search, and clears without losing search',
  (kind) => {
    const getView = () =>
      render(() =>
        RequirementsView({ analysis, graph: snapshot, role: 'OWNER', kind }),
      );
    let tree = getView();
    let panel = elements(tree).find((e) => e.type === FiltersPanel)!;
    const selects = elements(panel).filter((e) => e.type === 'select');
    expect(selects).toHaveLength(kind === 'RISK' ? 5 : 4);
    (selects[0]!.props['onChange'] as (e: unknown) => void)({
      target: { value: 'APPROVED' },
    });
    (
      elements(tree).find(
        (e) => e.type === 'input' && e.props['type'] === 'search',
      )!.props['onChange'] as (e: unknown) => void
    )({ target: { value: 'catalog' } });
    tree = getView();
    panel = elements(tree).find((e) => e.type === FiltersPanel)!;
    expect(panel.props['activeCount']).toBe(1);
    expect(
      elements(panel).filter((e) => e.type === 'select')[0]!.props['value'],
    ).toBe('APPROVED');
    (panel.props['onClear'] as () => void)();
    tree = getView();
    panel = elements(tree).find((e) => e.type === FiltersPanel)!;
    expect(panel.props['activeCount']).toBe(0);
    expect(
      elements(panel)
        .filter((e) => e.type === 'select')
        .every((e) => e.props['value'] === 'ALL'),
    ).toBe(true);
    expect(
      elements(tree).find(
        (e) => e.type === 'input' && e.props['type'] === 'search',
      )!.props['value'],
    ).toBe('catalog');
  },
);
it('risk cards expose severity and retained provenance with collapsed details', () => {
  const html = renderToStaticMarkup(
    render(() =>
      RequirementCard({
        item: risk,
        graph: snapshot,
        role: 'OWNER',
        number: 1,
      }),
    ),
  );
  expect(html).toContain('Risk 1');
  expect(html).toContain('severity');
  expect(html).not.toContain('open=""');
  expect(html).not.toContain(risk.id);
});
it.each(['APPROVE', 'EDIT', 'REJECT'])(
  'risk %s requires explicit confirmation and retains editing field identity',
  (decision) => {
    let tree = render(() => RequirementReview({ item: risk, role: 'OWNER' }));
    const fields = elements(tree).find(
      (e) => e.type === 'fieldset' && 'hidden' in e.props,
    )!;
    const radio = elements(tree).find(
      (e) => e.type === 'input' && e.props['value'] === decision,
    )!;
    (radio.props['onChange'] as () => void)();
    tree = render(() => RequirementReview({ item: risk, role: 'OWNER' }));
    expect(tree.props['label']).toBe(
      decision === 'EDIT'
        ? 'Confirm changes'
        : decision === 'REJECT'
          ? 'Confirm rejection'
          : 'Confirm approval',
    );
    const edited = elements(tree).find(
      (e) => e.type === 'fieldset' && 'hidden' in e.props,
    )!;
    expect(edited.key).toBe(fields.key);
    expect(edited.props['hidden']).toBe(decision !== 'EDIT');
    expect(
      elements(edited).find((e) => e.props['name'] === 'statement')!.props[
        'defaultValue'
      ],
    ).toBe(risk.statement);
  },
);
it('human risk creation stays collapsed and submits original analysis, risk kind, severity and evidence fields', () => {
  const tree = view();
  const add = elements(tree).find(
    (e) =>
      e.type === 'details' &&
      elements(e).some((n) => n.type === 'input' && n.props['name'] === 'kind'),
  )!;
  expect(add.props['open']).toBeUndefined();
  expect(
    elements(add).find((e) => e.props['name'] === 'kind')!.props['value'],
  ).toBe('RISK');
  expect(
    elements(add).find((e) => e.props['name'] === 'analysisId')!.props['value'],
  ).toBe(analysis.id);
  expect(
    elements(add).find((e) => e.props['name'] === 'severity'),
  ).toBeDefined();
  expect(elements(add).find((e) => e.props['name'] === 'nodeId')).toBeDefined();
});

it('risk severity filtering and summary counts use risk records only', () => {
  const records = analysis.records.filter((i) => i.kind === 'RISK');
  expect(requirementCounts(analysis, 'RISK').total).toBe(records.length);
  const filtered = filterRequirements(
    analysis,
    snapshot,
    {
      search: '',
      status: 'ALL',
      category: 'ALL',
      source: 'ALL',
      entity: 'ALL',
      severity: risk.severity!,
    },
    'RISK',
  );
  expect(filtered).toEqual(records.filter((i) => i.severity === risk.severity));
  expect(filtered.every((i) => i.kind === 'RISK')).toBe(true);
});
