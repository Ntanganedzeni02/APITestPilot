import { ValidationError, validateId } from './index.js';

export const graphNodeTypes = [
  'API',
  'SERVER',
  'OPERATION',
  'RESOURCE',
  'SCHEMA',
  'PARAMETER',
  'REQUEST_BODY',
  'RESPONSE',
  'SECURITY_SCHEME',
  'TAG',
  'IDENTIFIER',
  'STATE',
  'ACTOR',
] as const;
export type GraphNodeType = (typeof graphNodeTypes)[number];
export const graphEdgeEndpoints = {
  API_HAS_OPERATION: ['API', 'OPERATION'],
  API_HAS_SERVER: ['API', 'SERVER'],
  OPERATION_HAS_SERVER: ['OPERATION', 'SERVER'],
  OPERATION_TAGGED_WITH: ['OPERATION', 'TAG'],
  OPERATION_HAS_PARAMETER: ['OPERATION', 'PARAMETER'],
  OPERATION_ACCEPTS_REQUEST: ['OPERATION', 'REQUEST_BODY'],
  OPERATION_RETURNS_RESPONSE: ['OPERATION', 'RESPONSE'],
  OPERATION_REQUIRES_SECURITY: ['OPERATION', 'SECURITY_SCHEME'],
  REQUEST_USES_SCHEMA: ['REQUEST_BODY', 'SCHEMA'],
  RESPONSE_USES_SCHEMA: ['RESPONSE', 'SCHEMA'],
  PARAMETER_USES_SCHEMA: ['PARAMETER', 'SCHEMA'],
  SCHEMA_REFERENCES_SCHEMA: ['SCHEMA', 'SCHEMA'],
  RESOURCE_USES_SCHEMA: ['RESOURCE', 'SCHEMA'],
  OPERATION_READS_RESOURCE: ['OPERATION', 'RESOURCE'],
  OPERATION_CREATES_RESOURCE: ['OPERATION', 'RESOURCE'],
  OPERATION_UPDATES_RESOURCE: ['OPERATION', 'RESOURCE'],
  OPERATION_DELETES_RESOURCE: ['OPERATION', 'RESOURCE'],
  OPERATION_PRODUCES_IDENTIFIER: ['OPERATION', 'IDENTIFIER'],
  OPERATION_CONSUMES_IDENTIFIER: ['OPERATION', 'IDENTIFIER'],
  IDENTIFIER_BELONGS_TO_RESOURCE: ['IDENTIFIER', 'RESOURCE'],
  OPERATION_PRECEDES_OPERATION: ['OPERATION', 'OPERATION'],
  STATE_BELONGS_TO_RESOURCE: ['STATE', 'RESOURCE'],
  SECURITY_HAS_ACTOR: ['SECURITY_SCHEME', 'ACTOR'],
} as const;
export type GraphEdgeType = keyof typeof graphEdgeEndpoints;
export interface GraphProvenance {
  importId: string;
  sourcePointers: string[];
  ruleId: string;
  derivation: 'EXPLICIT' | 'DETERMINISTIC_INFERENCE';
  confidence: 'EXACT' | 'STRONG' | 'SUPPORTED';
  evidence: string[];
}
export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  provenance: GraphProvenance;
}
export interface GraphEdge {
  id: string;
  type: GraphEdgeType;
  from: string;
  to: string;
  provenance: GraphProvenance;
}
export interface BehaviourGraph {
  modelVersion: 1;
  builderVersion: string;
  workspaceId: string;
  projectId: string;
  importId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface GraphSnapshot {
  id: string;
  createdAt: string;
  createdBy: string;
  graph: BehaviourGraph;
}
export interface BehaviourGraphRepository {
  save(graph: BehaviourGraph): Promise<string>;
  list(
    workspaceId: string,
    projectId: string,
    importId: string,
    snapshotId?: string,
  ): Promise<GraphSnapshot[]>;
}
export const MAX_GRAPH_NODES = 12000;
export const MAX_GRAPH_EDGES = 30000;
export const MAX_GRAPH_BYTES = 8 * 1024 * 1024;
export const graphLogicalId = (...parts: string[]) => JSON.stringify(parts);
export const graphCompare = (a: string, b: string) => {
  // Code-point order matches PostgreSQL C collation, including astral Unicode.
  const left = Array.from(a);
  const right = Array.from(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const d = left[i]!.codePointAt(0)! - right[i]!.codePointAt(0)!;
    if (d) return d;
  }
  return left.length - right.length;
};
const utf8Bytes = (value: string) =>
  Array.from(value).reduce((n, c) => {
    const p = c.codePointAt(0)!;
    return n + (p < 128 ? 1 : p < 2048 ? 2 : p < 65536 ? 3 : 4);
  }, 0);

export function assertBehaviourGraph(
  value: unknown,
): asserts value is BehaviourGraph {
  const bad = () => {
    throw new ValidationError('Invalid behaviour graph.');
  };
  const obj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  if (
    !obj(value) ||
    value['modelVersion'] !== 1 ||
    typeof value['builderVersion'] !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(value['builderVersion'])
  )
    return bad();
  for (const k of ['workspaceId', 'projectId', 'importId'])
    validateId(value[k]);
  if (
    !Array.isArray(value['nodes']) ||
    !Array.isArray(value['edges']) ||
    value['nodes'].length < 1 ||
    value['nodes'].length > MAX_GRAPH_NODES ||
    value['edges'].length > MAX_GRAPH_EDGES
  )
    return bad();
  const provenance = (p: unknown) => {
    if (
      !obj(p) ||
      p['importId'] !== value['importId'] ||
      typeof p['ruleId'] !== 'string' ||
      !/^[A-Z][A-Z0-9_]{0,79}$/.test(p['ruleId']) ||
      !['EXPLICIT', 'DETERMINISTIC_INFERENCE'].includes(
        String(p['derivation']),
      ) ||
      !['EXACT', 'STRONG', 'SUPPORTED'].includes(String(p['confidence']))
    )
      return bad();
    for (const k of ['sourcePointers', 'evidence']) {
      const list = p[k];
      if (
        !Array.isArray(list) ||
        !list.length ||
        list.length > 100 ||
        list.some((s) => typeof s !== 'string' || !s.length || s.length > 4000)
      )
        return bad();
      if (
        list.some(
          (s, i) => i > 0 && graphCompare(String(list[i - 1]), String(s)) >= 0,
        )
      )
        return bad();
    }
    if (
      (p['sourcePointers'] as string[]).some(
        (s) => s !== '#' && !/^#\/(?:[^~]|~[01])*$/.test(s),
      )
    )
      return bad();
    if (p['derivation'] === 'EXPLICIT' && p['confidence'] !== 'EXACT')
      return bad();
  };
  const nodes = new Map<string, GraphNode>();
  let prior = '';
  for (const node of value['nodes']) {
    if (
      !obj(node) ||
      typeof node['id'] !== 'string' ||
      node['id'].length > 4000 ||
      graphCompare(prior, node['id']) >= 0 ||
      !graphNodeTypes.includes(node['type'] as GraphNodeType) ||
      typeof node['label'] !== 'string' ||
      !node['label'].length ||
      node['label'].length > 4000
    )
      return bad();
    provenance(node['provenance']);
    if (utf8Bytes(node['id']) > 2000) return bad();
    try {
      const parts: unknown = JSON.parse(node['id']);
      if (
        !Array.isArray(parts) ||
        parts.length !== 2 ||
        parts[0] !== node['type'] ||
        typeof parts[1] !== 'string' ||
        !parts[1].length ||
        graphLogicalId(...parts) !== node['id']
      )
        return bad();
    } catch {
      return bad();
    }
    prior = node['id'];
    nodes.set(node['id'], node as unknown as GraphNode);
  }
  prior = '';
  for (const edge of value['edges']) {
    if (
      !obj(edge) ||
      typeof edge['id'] !== 'string' ||
      graphCompare(prior, edge['id']) >= 0 ||
      typeof edge['from'] !== 'string' ||
      typeof edge['to'] !== 'string' ||
      typeof edge['type'] !== 'string' ||
      !Object.hasOwn(graphEdgeEndpoints, edge['type'])
    )
      return bad();
    const pair = graphEdgeEndpoints[edge['type'] as GraphEdgeType];
    if (
      nodes.get(edge['from'])?.type !== pair[0] ||
      nodes.get(edge['to'])?.type !== pair[1] ||
      edge['id'] !== graphLogicalId(edge['type'], edge['from'], edge['to']) ||
      (edge['from'] === edge['to'] &&
        edge['type'] !== 'SCHEMA_REFERENCES_SCHEMA')
    )
      return bad();
    provenance(edge['provenance']);
    if (utf8Bytes(edge['id']) > 2000) return bad();
    prior = edge['id'];
  }
  if ([...nodes.values()].filter((n) => n.type === 'API').length !== 1)
    return bad();
  // UTF-8 accounting without coupling the domain to Node/browser globals.
  const serialized = JSON.stringify(value);
  let bytes = 0;
  for (const c of serialized) {
    const cp = c.codePointAt(0)!;
    bytes += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
    if (bytes > MAX_GRAPH_BYTES) return bad();
  }
}
