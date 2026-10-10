import { readFileSync } from 'node:fs';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseApiSpec } from '@testpilot/api-spec';
import { buildBehaviourGraph } from '@testpilot/behaviour-graph';
const h = vi.hoisted(() => ({
  state: [] as unknown[],
  cursor: 0,
  push: vi.fn(),
  history: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.cursor++;
    if (!(i in h.state)) h.state[i] = initial;
    return [
      h.state[i],
      (value: unknown) => {
        h.state[i] = value;
      },
    ];
  },
  useMemo: (fn: () => unknown) => fn(),
  useEffect: () => {},
  useId: () => 'fixture-tabs',
  useTransition: () => [false, (fn: () => void) => fn()],
}));
import { ApiMapView, ImportSelect, importNavigation } from './api-map-view';
import { KnowledgeView, EndpointDetails } from './knowledge-view';
import { importOption } from './presentation';
import { TechnicalDetails } from './spec-details';
import { GraphView, GraphCanvas } from '../behaviour-graph/graph-view';
const k = parseApiSpec(
  readFileSync('packages/api-spec/tests/fixtures/catalog.json', 'utf8'),
  'json',
).knowledge;
const source = {
  id: '14000000-0000-0000-0000-000000000001',
  workspaceId: '14000000-0000-0000-0000-000000000002',
  projectId: '14000000-0000-0000-0000-000000000003',
  createdAt: '2026-10-08T11:14:00Z',
  createdBy: '14000000-0000-0000-0000-000000000004',
  knowledge: k,
};
const snapshot = {
  id: source.id,
  createdAt: source.createdAt,
  createdBy: source.createdBy,
  graph: buildBehaviourGraph(source),
};
function elements(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...elements(value.props['children'])];
}
function render<T>(fn: () => T) {
  h.cursor = 0;
  return fn();
}
function handler(element: ReactElement<Record<string, unknown>>, name: string) {
  return element.props[name] as (event?: unknown) => void;
}
beforeEach(() => {
  h.state = [];
  h.cursor = 0;
  vi.stubGlobal('window', {
    location: {
      href: `http://127.0.0.1:3000/api-map?import=${source.id}&view=graph`,
    },
    history: { replaceState: h.history },
  });
});
it('import selection immediately preserves the tab and URL identity without a submit button', () => {
  const newer = { ...source, id: '14000000-0000-0000-0000-000000000099' };
  const tree = render(() =>
    ImportSelect({
      imports: [source, newer].map(importOption),
      selectedId: source.id,
    }),
  );
  const select = elements(tree).find((e) => e.type === 'select')!;
  handler(select, 'onChange')({ currentTarget: { value: newer.id } });
  expect(h.push).toHaveBeenCalledWith(`/api-map?import=${newer.id}&view=graph`);
  expect(elements(tree).some((e) => e.type === 'button')).toBe(false);
  h.push.mockClear();
  handler(select, 'onChange')({ currentTarget: { value: 'foreign' } });
  expect(h.push).not.toHaveBeenCalled();
  expect(
    importNavigation('/api-map?view=schemas&endpoint=old&node=old', source.id),
  ).toBe(`/api-map?view=schemas&import=${source.id}`);
});
it('endpoint selection and reset selection only update presentation state', () => {
  let tree = render(() => KnowledgeView({ knowledge: k, snapshot }));
  const select = elements(tree).find(
    (e) =>
      e.type === 'button' &&
      elements(e).some((c) => c.props['children'] === 'POST'),
  )!;
  handler(select, 'onClick')();
  tree = render(() => KnowledgeView({ knowledge: k, snapshot }));
  expect(
    elements(tree).find((e) => e.type === EndpointDetails)!.props['operation'],
  ).toEqual(k.operations.find((op) => op.method === 'POST'));
  const clear = elements(tree).find(
    (e) => e.type === 'button' && e.props['children'] === 'Reset selection',
  )!;
  handler(clear, 'onClick')();
  tree = render(() => KnowledgeView({ knowledge: k, snapshot }));
  expect(
    elements(tree).find((e) => e.type === EndpointDetails)!.props['operation'],
  ).toEqual(k.operations[0]);
  expect(elements(tree).some((e) => e.type === 'form')).toBe(false);
});
it('tabs support keyboard navigation and preserve the selected import without executing actions', () => {
  const props = {
    imports: [importOption(source)],
    selected: source,
    initialTab: 'endpoints',
    importForm: <p>Import form fixture</p>,
  };
  let tree = render(() => ApiMapView(props));
  const tab = elements(tree).find((e) => e.props['role'] === 'tab')!;
  const focus = vi.fn();
  handler(
    tab,
    'onKeyDown',
  )({
    key: 'ArrowRight',
    preventDefault: vi.fn(),
    currentTarget: {
      parentElement: {
        querySelectorAll: () => [{ focus: vi.fn() }, { focus }],
      },
    },
  });
  tree = render(() => ApiMapView(props));
  expect(
    elements(tree).find(
      (e) => e.props['role'] === 'tab' && e.props['aria-selected'] === true,
    )!.props['children'],
  ).toBe('Behaviour Graph');
  expect(focus).toHaveBeenCalled();
  expect(h.history).toHaveBeenCalledWith(
    null,
    '',
    expect.objectContaining({ pathname: '/api-map' }),
  );
  expect(h.history.mock.calls[0]![2].searchParams.get('import')).toBe(
    source.id,
  );
});
it('graph list selection and filters inspect existing facts without rebuilding or execution', () => {
  let tree = render(() => GraphView({ snapshot }));
  const node = snapshot.graph.nodes[0]!;
  const button = elements(tree).find(
    (e) =>
      e.type === 'button' &&
      Array.isArray(e.props['children']) &&
      e.props['children'].includes(node.label),
  )!;
  handler(button, 'onClick')();
  tree = render(() => GraphView({ snapshot }));
  expect(
    elements(tree).find((e) => e.type === GraphCanvas)!.props['selectedId'],
  ).toBe(node.id);
  const filter = elements(tree).find((e) => e.type === 'select')!;
  handler(filter, 'onChange')({ target: { value: 'SCHEMA' } });
  tree = render(() => GraphView({ snapshot }));
  expect(
    (
      elements(tree).find((e) => e.type === GraphCanvas)!.props['nodes'] as {
        type: string;
      }[]
    ).every((n) => n.type === 'SCHEMA'),
  ).toBe(true);
  expect(elements(tree).some((e) => e.type === 'form')).toBe(false);
});
it('technical provenance is collapsed and rendered lazily on explicit expansion', () => {
  const value = {
    id: 'audit-id',
    ruleId: 'EXACT_RULE',
    sourcePointers: ['#/paths/~1items/get'],
    evidence: ['<script>untrusted</script>'],
  };
  let tree = render(() => TechnicalDetails({ value }));
  expect(renderToStaticMarkup(tree)).not.toContain('EXACT_RULE');
  handler(tree, 'onToggle')({ currentTarget: { open: true } });
  tree = render(() => TechnicalDetails({ value }));
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('EXACT_RULE');
  expect(html).toContain('#/paths/~1items/get');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
});

it('overview keeps imported schema counts separate, escapes text and exposes accessible tabs', () => {
  const altered = {
    ...source,
    knowledge: {
      ...k,
      description: '<script>not executable</script>',
      schemaCount: 7,
    },
  };
  const tree = render(() =>
    ApiMapView({
      imports: [importOption(altered)],
      selected: altered,
      snapshot,
      importForm: <p>Import fixture</p>,
    }),
  );
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('Imported component schemas');
  expect(html).toContain('>7<');
  expect(html).toContain('role="tablist"');
  expect(html).toContain('role="tabpanel"');
  expect(html).toContain('Schemas &amp; Security');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('View import');
  expect(html.replace(/<[^>]*>/g, '')).not.toContain(source.id);
});
it('zoom, pan and fit controls change the viewport without requesting or changing graph facts', () => {
  let tree = render(() => GraphView({ snapshot }));
  const zoom = elements(tree).find(
    (e) => e.props['aria-label'] === 'Zoom in graph',
  )!;
  handler(zoom, 'onClick')();
  tree = render(() => GraphView({ snapshot }));
  expect(
    elements(tree).find((e) => e.type === GraphCanvas)!.props['zoom'],
  ).toBe(1.5);
  const pan = elements(tree).find(
    (e) => e.props['aria-label'] === 'Pan graph right',
  )!;
  handler(pan, 'onClick')();
  tree = render(() => GraphView({ snapshot }));
  expect(
    elements(tree).find((e) => e.type === GraphCanvas)!.props['panX'],
  ).toBe(0.2);
  const fit = elements(tree).find(
    (e) => e.props['children'] === 'Fit to view',
  )!;
  handler(fit, 'onClick')();
  tree = render(() => GraphView({ snapshot }));
  expect(
    elements(tree).find((e) => e.type === GraphCanvas)!.props['zoom'],
  ).toBe(1);
  expect(
    elements(tree).find((e) => e.type === GraphCanvas)!.props['panX'],
  ).toBe(0);
});

it('graph nodes respond to Enter and Space exactly once per explicit selection', () => {
  const select = vi.fn();
  const nodes = snapshot.graph.nodes.slice(0, 2);
  const tree = render(() =>
    GraphCanvas({ nodes, edges: [], onSelect: select }),
  );
  const node = elements(tree).find(
    (e) => e.type === 'g' && e.props['role'] === 'button',
  )!;
  handler(node, 'onKeyDown')({ key: 'Enter', preventDefault: vi.fn() });
  handler(node, 'onKeyDown')({ key: ' ', preventDefault: vi.fn() });
  expect(select.mock.calls).toEqual([[nodes[0]!.id], [nodes[0]!.id]]);
});
it('browsing renders without automatic network or import/build submissions', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const tree = render(() =>
    ApiMapView({
      imports: [importOption(source)],
      selected: source,
      snapshot,
      importForm: <button type="submit">Explicit import fixture</button>,
      graphBuild: <button type="submit">Explicit graph build fixture</button>,
    }),
  );
  renderToStaticMarkup(tree);
  expect(fetch).not.toHaveBeenCalled();
  expect(h.push).not.toHaveBeenCalled();
});

it('endpoint selection survives filters and stale selections recover to the first available endpoint', () => {
  let tree = render(() => KnowledgeView({ knowledge: k, snapshot }));
  expect(
    elements(tree).find((e) => e.type === EndpointDetails)!.props['operation'],
  ).toEqual(k.operations[0]);
  const post = elements(tree).find(
    (e) =>
      e.type === 'button' &&
      elements(e).some((c) => c.props['children'] === 'POST'),
  )!;
  handler(post, 'onClick')();
  tree = render(() => KnowledgeView({ knowledge: k, snapshot }));
  const method = elements(tree).find((e) => e.type === 'select')!;
  handler(method, 'onChange')({ target: { value: 'GET' } });
  tree = render(() => KnowledgeView({ knowledge: k, snapshot }));
  expect(
    elements(tree).find((e) => e.type === EndpointDetails)!.props['operation'],
  ).toEqual(k.operations.find((o) => o.method === 'POST'));
  const changed = {
    ...k,
    operations: k.operations.filter((o) => o.method === 'GET'),
  };
  tree = render(() => KnowledgeView({ knowledge: changed }));
  expect(
    elements(tree).find((e) => e.type === EndpointDetails)!.props['operation'],
  ).toEqual(changed.operations[0]);
});
it('operation focus is the default, full graph keeps all facts available and selection highlights the neighborhood', () => {
  let tree = render(() => GraphView({ snapshot }));
  let canvas = elements(tree).find((e) => e.type === GraphCanvas)!;
  const selected = snapshot.graph.nodes.find((n) => n.type === 'OPERATION')!;
  expect(canvas.props['selectedId']).toBe(selected.id);
  expect(canvas.props['focused']).toBe(true);
  const view = elements(tree).find(
    (e) => e.type === 'select' && e.props['aria-label'] === 'Graph view',
  )!;
  handler(view, 'onChange')({ target: { value: 'full' } });
  tree = render(() => GraphView({ snapshot }));
  canvas = elements(tree).find((e) => e.type === GraphCanvas)!;
  expect(canvas.props['focused']).toBe(false);
  expect((canvas.props['nodes'] as unknown[]).length).toBe(
    snapshot.graph.nodes.length,
  );
  const html = renderToStaticMarkup(
    render(() =>
      GraphCanvas({
        nodes: snapshot.graph.nodes,
        edges: snapshot.graph.edges,
        selectedId: selected.id,
        onSelect: () => {},
      }),
    ),
  );
  expect(html).toContain('data-connected="true"');
  expect(html).toContain('opacity="0.15"');
});
it('arrow navigation moves keyboard focus without selecting or making requests', () => {
  const select = vi.fn(),
    nodes = snapshot.graph.nodes.slice(0, 2),
    focus = vi.fn();
  const tree = render(() =>
    GraphCanvas({ nodes, edges: [], onSelect: select }),
  );
  const node = elements(tree).find((e) => e.type === 'g')!;
  handler(
    node,
    'onKeyDown',
  )({
    key: 'ArrowRight',
    preventDefault: vi.fn(),
    currentTarget: {
      parentElement: {
        querySelectorAll: () => [{ focus: vi.fn() }, { focus }],
      },
    },
  });
  expect(focus).toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});

afterEach(() => vi.unstubAllGlobals());
it('selecting a node focuses its accessible inspection panel and brings an offscreen header into view', () => {
  const panel = {
    focus: vi.fn(),
    scrollIntoView: vi.fn(),
    getBoundingClientRect: () => ({ top: -500 }),
  };
  vi.stubGlobal('document', { getElementById: () => panel });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => {
    fn();
    return 1;
  });
  const tree = render(() => GraphView({ snapshot }));
  const node = elements(tree).find(
    (e) =>
      e.type === 'button' &&
      Array.isArray(e.props['children']) &&
      e.props['children'].includes(snapshot.graph.nodes[0]!.label),
  )!;
  handler(node, 'onClick')();
  expect(panel.focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(panel.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
});
