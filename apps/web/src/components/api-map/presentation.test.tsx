import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { parseApiSpec } from '@testpilot/api-spec';
import { buildBehaviourGraph } from '@testpilot/behaviour-graph';
import type { ApiImportSummary } from '@testpilot/domain';
import {
  filterEndpoints,
  endpointGroups,
  schemaType,
  constraints,
  relatedFacts,
  securityLabel,
  importOption,
} from './presentation';
import { EndpointDetails } from './knowledge-view';
import {
  SchemaReference,
  SchemasView,
  SecurityRequirements,
} from './spec-details';
const k = parseApiSpec(
  readFileSync('packages/api-spec/tests/fixtures/catalog.json', 'utf8'),
  'json',
).knowledge;
const source: ApiImportSummary = {
  id: '14000000-0000-0000-0000-000000000001',
  workspaceId: '14000000-0000-0000-0000-000000000002',
  projectId: '14000000-0000-0000-0000-000000000003',
  createdAt: '2026-10-08T11:14:00Z',
  createdBy: '14000000-0000-0000-0000-000000000004',
  knowledge: k,
};
const graph = buildBehaviourGraph(source);
it('filters endpoints by method, path, summary and tag and safely handles empty results', () => {
  expect(filterEndpoints(k.operations, 'get', 'GET')).toHaveLength(2);
  expect(filterEndpoints(k.operations, '/items/{id}', 'ALL')).toHaveLength(1);
  expect(filterEndpoints(k.operations, 'list items', 'ALL')).toHaveLength(1);
  expect(filterEndpoints(k.operations, 'catalog', 'ALL')).toHaveLength(3);
  expect(filterEndpoints(k.operations, 'missing', 'ALL')).toHaveLength(0);
});
it('uses declared tags and only persisted resource relationships for grouping', () => {
  expect(endpointGroups(k.operations, 'tag')[0]![0]).toBe('Catalog');
  expect(endpointGroups(k.operations, 'resource')).toEqual([
    ['No inferred resource', k.operations],
  ]);
  const groups = endpointGroups(k.operations, 'resource', graph);
  expect(groups.flatMap(([, ops]) => ops)).toEqual(
    expect.arrayContaining(k.operations),
  );
  expect(groups.some(([label]) => label !== 'No inferred resource')).toBe(true);
  expect(relatedFacts(graph, k.operations[0]!).node?.type).toBe('OPERATION');
});
it('shows declared required parameters, media types, response codes and absent bodies', () => {
  const op = k.operations.find((o) => o.path === '/items/{id}')!;
  const html = renderToStaticMarkup(
    <EndpointDetails operation={op} knowledge={k} />,
  );
  for (const label of [
    'Parameters',
    'Location',
    'path',
    'Yes',
    'Responses',
    '200',
    '404',
    'application/json',
    'Reference: Item',
    'No request body declared',
  ])
    expect(html).toContain(label);
  expect(html).not.toContain('must-not-be-stored');
  const post = k.operations.find((o) => o.method === 'POST')!;
  const postHtml = renderToStaticMarkup(
    <EndpointDetails operation={post} knowledge={k} />,
  );
  expect(postHtml).toContain('Required');
  expect(postHtml).toContain('201');
});
it('preserves security OR alternatives, AND schemes, scope lists and anonymous alternatives', () => {
  const html = renderToStaticMarkup(
    <SecurityRequirements value={[{ oauth: ['read'], apiKey: [] }, {}]} />,
  );
  expect(html).toContain('Alternative 1');
  expect(html).toContain('Alternative 2');
  expect(html).toContain('AND apiKey');
  expect(html).toContain('scopes: read');
  expect(html).toContain('No authentication required for this alternative');
  expect(securityLabel([{ oauth: [] }, {}])).toBe('Authentication optional');
  expect(securityLabel([])).toBe('No security requirement');
  expect(securityLabel([{ oauth: [] }])).toBe('Authentication declared');
  expect(renderToStaticMarkup(<SecurityRequirements value={[]} />)).toContain(
    'does not prove the live API is public',
  );
});
it('renders schema field requirements without merging graph and import schema metrics', () => {
  const html = renderToStaticMarkup(<SchemasView knowledge={k} />);
  expect(html).toContain('1 component schemas imported');
  expect(html).toContain('Graph schema nodes are a separate metric');
  expect(html).toContain('Field');
  expect(html).toContain('related');
  expect(html).toContain('Yes');
  expect(html).toContain('No');
  expect(html).toContain('not authorized execution targets');
});
it('handles unresolved refs, boolean schemas, composition and unknown types honestly', () => {
  expect(schemaType(false)).toBe('No value allowed');
  expect(schemaType(true)).toContain('unrestricted');
  expect(schemaType({ type: ['string', 'null'] })).toBe('string or null');
  expect(schemaType({ oneOf: [{ type: 'string' }, { type: 'number' }] })).toBe(
    'Exactly one of 2 schemas',
  );
  expect(schemaType(null)).toBe('Type not declared');
  expect(constraints({ minimum: 1, readOnly: true })).toContain('Minimum: 1');
  expect(
    renderToStaticMarkup(
      <SchemaReference
        schema={{ $ref: '#/components/schemas/Absent' }}
        knowledge={k}
      />,
    ),
  ).toContain('Reference not resolved');
  expect(
    renderToStaticMarkup(
      <SchemaReference
        schema={{ $ref: '#/components/schemas/Item' }}
        knowledge={k}
      />,
    ),
  ).toContain('Local reference declared');
});

it('history sends metadata only and empty endpoints have a useful state', () => {
  const summary = importOption(source);
  expect(summary).not.toHaveProperty('knowledge');
  expect(summary.title).toBe(k.title);
  expect(summary.operationCount).toBe(k.operations.length);
  expect(filterEndpoints([], '', 'ALL')).toEqual([]);
});
