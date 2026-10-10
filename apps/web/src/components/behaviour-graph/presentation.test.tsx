import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseApiSpec } from '@testpilot/api-spec';
import { buildBehaviourGraph } from '@testpilot/behaviour-graph';
import { graphEdgeEndpoints } from '@testpilot/domain';
import {
  filterGraph,
  graphWindow,
  graphPositions,
  relationshipLabel,
  connectedNodes,
  edgeCurve,
} from './presentation';
import { GraphCanvas } from './graph-view';
const graph = buildBehaviourGraph({
  id: '14000000-0000-0000-0000-000000000001',
  workspaceId: '14000000-0000-0000-0000-000000000002',
  projectId: '14000000-0000-0000-0000-000000000003',
  createdAt: '2026-10-08T11:14:00Z',
  createdBy: '14000000-0000-0000-0000-000000000004',
  knowledge: parseApiSpec(
    readFileSync('packages/behaviour-graph/tests/fixtures/users.json', 'utf8'),
    'json',
  ).knowledge,
});
it('labels every real relationship without changing enums or implying mandatory execution', () => {
  for (const type of Object.keys(
    graphEdgeEndpoints,
  ) as (keyof typeof graphEdgeEndpoints)[])
    expect(relationshipLabel(type)).toBeTruthy();
  expect(relationshipLabel('OPERATION_PRECEDES_OPERATION')).toBe(
    'Possible identifier dependency',
  );
  expect(relationshipLabel('OPERATION_READS_RESOURCE')).toBe('Reads resource');
});
it('filters actual graph nodes and edges and never synthesizes connections', () => {
  const result = filterGraph(graph, 'ALL', 'OPERATION_HAS_PARAMETER', '');
  expect(
    result.nodes.every((n) =>
      graph.edges.some(
        (e) =>
          e.type === 'OPERATION_HAS_PARAMETER' &&
          (e.from === n.id || e.to === n.id),
      ),
    ),
  ).toBe(true);
  expect(
    result.edges.every(
      (e) => e.type === 'OPERATION_HAS_PARAMETER' && graph.edges.includes(e),
    ),
  ).toBe(true);
  expect(
    filterGraph(graph, 'OPERATION', 'ALL', 'GET').nodes.every(
      (n) => n.type === 'OPERATION' && n.label.includes('GET'),
    ),
  ).toBe(true);
  expect(
    filterGraph(graph, 'ALL', 'ALL', 'nothing matches').nodes,
  ).toHaveLength(0);
});
it('bounds visual work, keeps selected nodes visible and retains full filtered graph', () => {
  const nodes = Array.from({ length: 500 }, (_, i) => ({
    ...graph.nodes[0]!,
    id: `node-${i}`,
  }));
  const edges = Array.from({ length: 499 }, (_, i) => ({
    ...graph.edges[0]!,
    id: `edge-${i}`,
    from: `node-${i}`,
    to: `node-${i + 1}`,
  }));
  const filtered = { nodes, edges };
  const window = graphWindow(filtered, 'node-499');
  expect(window.nodes).toHaveLength(120);
  expect(window.nodes[0]!.id).toBe('node-499');
  expect(window.edges.length).toBeLessThanOrEqual(400);
  expect(filtered.nodes).toHaveLength(500);
  expect(
    graphWindow(filtered, 'node-499', true).nodes.map((n) => n.id),
  ).toEqual(['node-499', 'node-498']);
  const positions = graphPositions(window.nodes);
  expect(positions.points.size).toBe(120);
});
it('renders only stored directional edges and keyboard selectable nodes', () => {
  const nodes = graph.nodes.slice(0, 20),
    ids = new Set(nodes.map((n) => n.id)),
    edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const html = renderToStaticMarkup(
    <GraphCanvas
      nodes={nodes}
      edges={edges}
      selectedId={nodes[0]!.id}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain('role="button"');
  expect(html).toContain('tabindex="0"');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('Stored nodes and directional relationships');
  expect((html.match(/marker-end=/g) ?? []).length).toBe(edges.length);
});

it('caps dense edge rendering while preserving every stored edge for inspection', () => {
  const nodes = graph.nodes.slice(0, 2);
  const edges = Array.from({ length: 1000 }, (_, i) => ({
    ...graph.edges[0]!,
    id: `dense-${i}`,
    from: nodes[0]!.id,
    to: nodes[1]!.id,
  }));
  const preview = graphWindow({ nodes, edges });
  expect(preview.edges).toHaveLength(400);
  expect(preview.totalEdges).toBe(1000);
  expect(edges).toHaveLength(1000);
});

it('focused layout places the selected operation between its actual incoming and outgoing neighbors', () => {
  const operation = graph.nodes.find((n) => n.type === 'OPERATION')!;
  const preview = graphWindow(
    filterGraph(graph, 'ALL', 'ALL', ''),
    operation.id,
    true,
  );
  const layout = graphPositions(preview.nodes, preview.edges, operation.id);
  expect(layout.points.get(operation.id)!.x).toBe(500);
  expect(layout.points.size).toBe(preview.nodes.length);
  const outgoing = new Set(
    preview.edges.filter((e) => e.from === operation.id).map((e) => e.to),
  );
  for (const node of preview.nodes.filter(
    (n) => outgoing.has(n.id) && n.id !== operation.id,
  ))
    expect(layout.points.get(node.id)!.x).toBe(840);
  const coords = [...layout.points.values()].map((p) => `${p.x}:${p.y}`);
  expect(new Set(coords).size).toBe(coords.length);
});
it('connection highlighting and curved edge routing preserve stored facts and exact direction', () => {
  const edge = graph.edges[0]!,
    ids = connectedNodes(graph.edges, edge.from);
  expect(ids.has(edge.from)).toBe(true);
  expect(ids.has(edge.to)).toBe(true);
  expect(edgeCurve({ x: 0, y: 0 }, { x: 400, y: 100 })).toContain('C');
  expect(edgeCurve({ x: 0, y: 0 }, { x: 400, y: 100 }, 10)).not.toBe(
    edgeCurve({ x: 0, y: 0 }, { x: 400, y: 100 }),
  );
  expect(edgeCurve({ x: 0, y: 0 }, { x: 0, y: 0 })).not.toMatch(/NaN|Infinity/);
});
