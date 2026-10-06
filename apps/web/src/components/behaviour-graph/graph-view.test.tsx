import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { parseApiSpec } from '@testpilot/api-spec';
import { buildBehaviourGraph } from '@testpilot/behaviour-graph';
import { GraphView, FactReason } from './graph-view';
it('renders inspectable resources, operations and escaped provenance without runtime claims', () => {
  const graph = buildBehaviourGraph({
    id: '14000000-0000-0000-0000-000000000001',
    workspaceId: '14000000-0000-0000-0000-000000000002',
    projectId: '14000000-0000-0000-0000-000000000003',
    createdAt: '2026-10-06T00:00:00Z',
    createdBy: '14000000-0000-0000-0000-000000000004',
    knowledge: parseApiSpec(
      readFileSync(
        'packages/behaviour-graph/tests/fixtures/users.json',
        'utf8',
      ),
      'json',
    ).knowledge,
  });
  graph.nodes[0]!.provenance.evidence = ['<script>alert(1)</script>'];
  const html = renderToStaticMarkup(
    <GraphView
      snapshot={{
        id: graph.importId,
        createdAt: '2026-10-06T00:00:00Z',
        createdBy: graph.importId,
        graph,
      }}
    />,
  );
  expect(html).toContain('User (/users)');
  expect(html).toContain('Operation relationships');
  const reason = renderToStaticMarkup(<FactReason fact={graph.nodes[0]!} />);
  expect(reason).toContain('Why this relationship exists');
  expect(html).toContain('runtime behaviour has not been verified');
  expect(reason).not.toContain('<script>');
  expect(reason).toContain('&lt;script&gt;');
});
