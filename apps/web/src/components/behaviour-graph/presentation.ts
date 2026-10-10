import {
  type BehaviourGraph,
  type GraphEdgeType,
  type GraphNode,
} from '@testpilot/domain';
export const relationshipNames: Record<GraphEdgeType, string> = {
  API_HAS_OPERATION: 'Has operation',
  API_HAS_SERVER: 'Declares server',
  OPERATION_HAS_SERVER: 'Declares server',
  OPERATION_TAGGED_WITH: 'Tagged with',
  OPERATION_HAS_PARAMETER: 'Has parameter',
  OPERATION_ACCEPTS_REQUEST: 'Accepts request body',
  OPERATION_RETURNS_RESPONSE: 'Declares response',
  OPERATION_REQUIRES_SECURITY: 'Declares security requirement',
  REQUEST_USES_SCHEMA: 'Request uses schema',
  RESPONSE_USES_SCHEMA: 'Response uses schema',
  PARAMETER_USES_SCHEMA: 'Parameter uses schema',
  SCHEMA_REFERENCES_SCHEMA: 'References schema',
  RESOURCE_USES_SCHEMA: 'Resource uses schema',
  OPERATION_READS_RESOURCE: 'Reads resource',
  OPERATION_CREATES_RESOURCE: 'Creates resource',
  OPERATION_UPDATES_RESOURCE: 'Updates resource',
  OPERATION_DELETES_RESOURCE: 'Deletes resource',
  OPERATION_PRODUCES_IDENTIFIER: 'Produces identifier',
  OPERATION_CONSUMES_IDENTIFIER: 'Consumes identifier',
  IDENTIFIER_BELONGS_TO_RESOURCE: 'Resource identifier',
  OPERATION_PRECEDES_OPERATION: 'Possible identifier dependency',
  STATE_BELONGS_TO_RESOURCE: 'Possible resource state',
  SECURITY_HAS_ACTOR: 'Declares actor',
};
export function relationshipLabel(type: GraphEdgeType) {
  return relationshipNames[type];
}
export function nodeLabel(type: string) {
  if (type === 'API') return 'API';
  if (type === 'OPERATION') return 'API operation';
  return type
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (s) => s.toUpperCase());
}
export function filterGraph(
  graph: BehaviourGraph,
  type: string,
  relationship: string,
  search: string,
) {
  const query = search.trim().toLowerCase();
  const candidate = graph.nodes.filter(
    (n) =>
      (type === 'ALL' || n.type === type) &&
      n.label.toLowerCase().includes(query),
  );
  const relationshipEdges = graph.edges.filter(
    (e) => relationship === 'ALL' || e.type === relationship,
  );
  const connected = new Set(relationshipEdges.flatMap((e) => [e.from, e.to]));
  const nodes =
    relationship === 'ALL'
      ? candidate
      : candidate.filter((n) => connected.has(n.id));
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: relationshipEdges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  };
}
export function graphWindow(
  filtered: ReturnType<typeof filterGraph>,
  selectedId?: string,
  neighborhood = false,
) {
  const neighbors = new Set<string>(selectedId ? [selectedId] : []);
  if (neighborhood && selectedId)
    for (const e of filtered.edges)
      if (e.from === selectedId || e.to === selectedId) {
        neighbors.add(e.from);
        neighbors.add(e.to);
      }
  const candidates =
    neighborhood && selectedId
      ? filtered.nodes.filter((n) => neighbors.has(n.id))
      : filtered.nodes;
  const selected = candidates.find((n) => n.id === selectedId);
  const nodes = selected
    ? [selected, ...candidates.filter((n) => n.id !== selectedId)].slice(0, 120)
    : candidates.slice(0, 120);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = filtered.edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .slice(0, 400);
  return {
    nodes,
    edges,
    totalNodes: candidates.length,
    totalEdges: filtered.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
      .length,
  };
}
export function graphPositions(
  nodes: GraphNode[],
  edges: BehaviourGraph['edges'] = [],
  focusedId?: string,
) {
  const points = new Map<string, { x: number; y: number }>();
  const anchor = nodes.find((n) => n.id === focusedId);
  if (anchor) {
    const outgoing = new Set(
      edges.filter((e) => e.from === anchor.id).map((e) => e.to),
    );
    const left = nodes.filter((n) => n.id !== anchor.id && !outgoing.has(n.id));
    const right = nodes.filter((n) => n.id !== anchor.id && outgoing.has(n.id));
    const height = Math.max(360, Math.max(left.length, right.length) * 88 + 80);
    points.set(anchor.id, { x: 500, y: height / 2 });
    for (const [x, group] of [
      [160, left],
      [840, right],
    ] as const)
      group.forEach((n, i) =>
        points.set(n.id, {
          x,
          y: (height - (group.length - 1) * 88) / 2 + i * 88,
        }),
      );
    return { points, width: 1000, height };
  }
  const lane = (n: GraphNode) =>
    ['API', 'SERVER', 'TAG'].includes(n.type)
      ? 0
      : n.type === 'OPERATION'
        ? 1
        : ['SCHEMA', 'SECURITY_SCHEME', 'ACTOR'].includes(n.type)
          ? 3
          : 2;
  const lanes = [0, 1, 2, 3].map((column) =>
    nodes.filter((n) => lane(n) === column),
  );
  const tallest = Math.max(1, ...lanes.map((group) => group.length));
  lanes.forEach((group, col) =>
    group.forEach((n, row) =>
      points.set(n.id, { x: 150 + col * 300, y: 60 + row * 88 }),
    ),
  );
  return { points, width: 1200, height: Math.max(360, tallest * 88 + 40) };
}
export function connectedNodes(
  edges: BehaviourGraph['edges'],
  selectedId?: string,
) {
  const ids = new Set<string>();
  if (selectedId) {
    ids.add(selectedId);
    for (const edge of edges)
      if (edge.from === selectedId || edge.to === selectedId) {
        ids.add(edge.from);
        ids.add(edge.to);
      }
  }
  return ids;
}
export function edgeCurve(
  from: { x: number; y: number },
  to: { x: number; y: number },
  offset = 0,
) {
  if (from.x === to.x && from.y === to.y)
    return `M ${from.x + 116} ${from.y - 10} C ${from.x + 175 + offset} ${from.y - 65} ${from.x + 175 + offset} ${from.y + 65} ${from.x + 116} ${from.y + 15}`;
  if (from.x === to.x)
    return `M ${from.x + 116} ${from.y} C ${from.x + 175 + offset} ${from.y} ${to.x + 175 + offset} ${to.y} ${to.x + 116} ${to.y}`;
  const direction = Math.sign(to.x - from.x),
    start = from.x + direction * 116,
    end = to.x - direction * 116;
  const middle = (start + end) / 2 + offset;
  return `M ${start} ${from.y} C ${middle} ${from.y + offset} ${middle} ${to.y + offset} ${end} ${to.y}`;
}
