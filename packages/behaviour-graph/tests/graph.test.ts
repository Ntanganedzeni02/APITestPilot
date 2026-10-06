import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseApiSpec } from '@testpilot/api-spec';
import {
  assertBehaviourGraph,
  graphCompare,
  type ApiImportSummary,
  type GraphEdgeType,
  type Json,
} from '@testpilot/domain';
import {
  buildBehaviourGraph,
  validateGraph,
  graphRules,
  incoming,
  outgoing,
  neighbors,
  operationsTouchingResource,
  schemasUsedByOperation,
  securityRequiredByOperation,
  identifierProducers,
  identifierConsumers,
  dependentOperations,
  bySourcePointer,
  byRule,
  createGraphIndex,
} from '../src/index.js';
const text = readFileSync(
  'packages/behaviour-graph/tests/fixtures/users.json',
  'utf8',
);
const source = (): ApiImportSummary => ({
  id: '14000000-0000-0000-0000-000000000001',
  workspaceId: '14000000-0000-0000-0000-000000000002',
  projectId: '14000000-0000-0000-0000-000000000003',
  createdAt: '2026-10-06T00:00:00Z',
  createdBy: '14000000-0000-0000-0000-000000000004',
  knowledge: parseApiSpec(text, 'json').knowledge,
});
const build = () => buildBehaviourGraph(source());
const count = (type: GraphEdgeType) =>
  build().edges.filter((e) => e.type === type).length;
describe('deterministic behaviour graph', () => {
  it('normalizes conjunctive security evidence independently of object order', () => {
    const a = source();
    const b = source();
    a.knowledge.operations[0]!.security = [
      { bearer: [], oauth: ['reports:read'] },
    ];
    b.knowledge.operations[0]!.security = [
      { oauth: ['reports:read'], bearer: [] },
    ];
    expect(buildBehaviourGraph(a)).toEqual(buildBehaviourGraph(b));
  });
  it('resolves every provenance pointer to the fixture source', () => {
    const root = JSON.parse(text) as Record<string, unknown>;
    for (const fact of [...build().nodes, ...build().edges])
      for (const pointer of fact.provenance.sourcePointers) {
        let target: unknown = root;
        for (const part of pointer.slice(2).split('/')) {
          expect(target).toBeDefined();
          target = (target as Record<string, unknown>)[
            part.replaceAll('~1', '/').replaceAll('~0', '~')
          ];
        }
        expect(target, `${fact.type}: ${pointer}`).toBeDefined();
      }
  });
  it('indexes adjacency including recursive schema edges without duplicate facts', () => {
    const g = build();
    const index = createGraphIndex(g);
    for (const n of g.nodes) {
      expect(index.incoming(n.id)).toEqual(incoming(g, n.id));
      expect(index.outgoing(n.id)).toEqual(outgoing(g, n.id));
    }
  });
  it('orders astral Unicode by code point rather than UTF-16 units', () => {
    expect(graphCompare('\uE000', '😀')).toBeLessThan(0);
  });
  it('constructs declared inputs, outputs, schemas, tags and servers', () => {
    const g = build();
    expect(g.nodes.filter((n) => n.type === 'OPERATION')).toHaveLength(13);
    expect(count('API_HAS_SERVER')).toBe(1);
    expect(count('OPERATION_HAS_PARAMETER')).toBeGreaterThan(5);
    expect(count('REQUEST_USES_SCHEMA')).toBeGreaterThan(0);
    expect(count('RESPONSE_USES_SCHEMA')).toBeGreaterThan(0);
    expect(count('OPERATION_TAGGED_WITH')).toBeGreaterThan(0);
    expect(count('SCHEMA_REFERENCES_SCHEMA')).toBeGreaterThan(0);
  });
  it('infers User and nested Order resources from shared direct schemas', () => {
    const resources = build().nodes.filter((n) => n.type === 'RESOURCE');
    expect(resources.map((n) => n.label).sort()).toEqual([
      'Order (/users/{userId}/orders)',
      'User (/users)',
    ]);
  });
  it.each([
    'OPERATION_READS_RESOURCE',
    'OPERATION_CREATES_RESOURCE',
    'OPERATION_UPDATES_RESOURCE',
    'OPERATION_DELETES_RESOURCE',
  ] as const)('corroborates %s', (type) =>
    expect(count(type)).toBeGreaterThan(1),
  );
  it('creates exact identifier dependencies and keeps nested resources distinct', () => {
    const g = build();
    const create = g.nodes.find((n) => n.label === 'POST /users')!;
    expect(
      dependentOperations(g, create.id)
        .map((n) => n.label)
        .sort(),
    ).toEqual([
      'DELETE /users/{userId}',
      'GET /users/{userId}',
      'PATCH /users/{userId}',
    ]);
    const order = g.nodes.find(
      (n) => n.label === 'POST /users/{userId}/orders',
    )!;
    expect(dependentOperations(g, order.id).map((n) => n.label)).not.toContain(
      'GET /users/{userId}',
    );
  });
  it('does not infer search resources, login endpoints, or vague-name dependencies', () => {
    const g = build();
    expect(
      g.nodes
        .filter((n) => n.type === 'RESOURCE')
        .some((n) => n.label.includes('Search')),
    ).toBe(false);
    expect(g.nodes.some((n) => n.label.includes('/login'))).toBe(false);
    const vague = g.nodes.find(
      (n) => n.label === 'HEAD /users/{userIdentifier}',
    )!;
    expect(
      incoming(g, vague.id).some(
        (e) => e.type === 'OPERATION_PRECEDES_OPERATION',
      ),
    ).toBe(false);
  });
  it('extracts only status/state enum values without transitions or currency states', () => {
    const states = build().nodes.filter((n) => n.type === 'STATE');
    expect(states).toHaveLength(5);
    expect(states.some((n) => n.label.includes('currency'))).toBe(false);
    expect(
      build().edges.some((e) => String(e.type).includes('TRANSITION')),
    ).toBe(false);
  });
  it('preserves global/security override and explicitly declared OAuth capabilities', () => {
    const g = build();
    const search = g.nodes.find((n) => n.label === 'POST /search')!;
    expect(securityRequiredByOperation(g, search.id)).toHaveLength(0);
    const read = g.nodes.find((n) => n.label === 'GET /users')!;
    expect(securityRequiredByOperation(g, read.id).map((n) => n.label)).toEqual(
      ['bearer'],
    );
    expect(
      g.nodes.filter((n) => n.type === 'ACTOR').map((n) => n.label),
    ).toEqual(['Capability: reports:read']);
  });
  it('provides complete provenance and registered deterministic explanations', () => {
    const g = build();
    for (const fact of [...g.nodes, ...g.edges]) {
      expect(fact.provenance.importId).toBe(g.importId);
      expect(fact.provenance.sourcePointers.length).toBeGreaterThan(0);
      expect(graphRules).toHaveProperty(fact.provenance.ruleId);
      expect(fact.provenance.evidence.length).toBeGreaterThan(0);
    }
    expect(byRule(g, 'STATUS_ENUM').nodes).toHaveLength(5);
    expect(
      bySourcePointer(g, '#/components/schemas/User').nodes.length,
    ).toBeGreaterThan(0);
  });
  it('rebuilds equivalent identities regardless of object/operation iteration order', () => {
    const a = source();
    const b = source();
    b.knowledge.operations.reverse();
    const reverse = (value: Json): Json =>
      Array.isArray(value)
        ? value.map(reverse)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([k, v]) => [k, reverse(v)]),
            )
          : value;
    b.knowledge.components = reverse(b.knowledge.components);
    expect(buildBehaviourGraph(b)).toEqual(buildBehaviourGraph(a));
  });
  it('exposes reusable traversal and identifier helpers', () => {
    const g = build();
    const op = g.nodes.find((n) => n.label === 'POST /users')!;
    const resource = g.nodes.find((n) => n.label === 'User (/users)')!;
    const id = g.nodes.find((n) => n.label === 'User.id')!;
    expect(outgoing(g, op.id).length).toBeGreaterThan(0);
    expect(neighbors(g, op.id).length).toBeGreaterThan(0);
    expect(operationsTouchingResource(g, resource.id).length).toBe(5);
    expect(schemasUsedByOperation(g, op.id).map((n) => n.label)).toEqual([
      'User',
      'UserCreate',
    ]);
    expect(identifierProducers(g, id.id)).toHaveLength(1);
    expect(identifierConsumers(g, id.id)).toHaveLength(3);
  });
  it('does not infer resources from unrelated schemas or a lone operation', () => {
    const s = source();
    s.knowledge.operations = s.knowledge.operations.filter(
      (o) => o.key === 'GET /reports' || o.key === 'POST /search',
    );
    const g = buildBehaviourGraph(s);
    expect(g.nodes.some((n) => n.type === 'RESOURCE')).toBe(false);
  });
  it('does not match incompatible identifier formats', () => {
    const s = source();
    for (const o of s.knowledge.operations)
      for (const p of o.parameters)
        if (p.name === 'userId') p.schema = { type: 'integer' };
    const g = buildBehaviourGraph(s);
    const create = g.nodes.find((n) => n.label === 'POST /users')!;
    expect(dependentOperations(g, create.id)).toHaveLength(0);
  });
  it('does not guess among multiple identifiers', () => {
    const s = source();
    const components = s.knowledge.components as Record<string, Json>;
    const schemas = components['schemas'] as Record<string, Json>;
    const user = schemas['User'] as Record<string, Json>;
    const properties = user['properties'] as Record<string, Json>;
    properties['userId'] = { type: 'string', format: 'uuid' };
    user['required'] = ['id', 'userId'];
    const g = buildBehaviourGraph(s);
    expect(
      g.edges.filter(
        (e) =>
          e.type === 'OPERATION_CONSUMES_IDENTIFIER' &&
          g.nodes.find((n) => n.id === e.to)?.label.startsWith('User.'),
      ),
    ).toHaveLength(0);
  });
  it.each([
    'duplicate node',
    'duplicate edge',
    'missing endpoint',
    'wrong endpoint type',
    'cross import',
    'self dependency',
    'missing provenance',
    'unknown rule',
    'unsorted',
    'wrong tenant',
  ] as const)('rejects malformed graph: %s', (kind) => {
    const g = structuredClone(build());
    const edge = g.edges.find(
      (e) => e.type === 'OPERATION_PRECEDES_OPERATION',
    )!;
    if (kind === 'duplicate node') g.nodes.push(g.nodes[0]!);
    if (kind === 'duplicate edge') g.edges.push(g.edges[0]!);
    if (kind === 'missing endpoint') edge.to = 'missing';
    if (kind === 'wrong endpoint type')
      edge.to = g.nodes.find((n) => n.type === 'API')!.id;
    if (kind === 'cross import')
      g.nodes[0]!.provenance.importId = '14000000-0000-0000-0000-000000000099';
    if (kind === 'self dependency') edge.to = edge.from;
    if (kind === 'missing provenance')
      g.nodes[0]!.provenance.sourcePointers = [];
    if (kind === 'unknown rule') g.nodes[0]!.provenance.ruleId = 'UNKNOWN';
    if (kind === 'unsorted') g.nodes.reverse();
    if (kind === 'wrong tenant') g.workspaceId = 'invalid';
    expect(() => validateGraph(g)).toThrow();
  });
  it('rejects invalid normalized input and graph size bounds', () => {
    const s = source();
    s.knowledge.modelVersion = 2 as 1;
    expect(() => buildBehaviourGraph(s)).toThrow();
    const g = build();
    g.nodes = Array.from({ length: 12001 }, () => g.nodes[0]!);
    expect(() => assertBehaviourGraph(g)).toThrow();
  });
  it('uses stable nonlocale code point ordering', () =>
    expect(graphCompare('a', 'b')).toBeLessThan(0));
});
