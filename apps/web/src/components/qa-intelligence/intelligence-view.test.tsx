import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { parseApiSpec } from '@testpilot/api-spec';
import { buildBehaviourGraph } from '@testpilot/behaviour-graph';
import { deriveQa } from '@testpilot/qa-intelligence';
import type { QaAnalysis } from '@testpilot/domain';
import { IntelligenceView } from './intelligence-view';
vi.mock('./action-form', () => ({
  QaActionForm: ({ label }: { label: string }) => <button>{label}</button>,
}));
const time = '2026-10-07T00:00:00Z',
  id = '15000000-0000-0000-0000-000000000001';
const source = {
  id,
  workspaceId: id,
  projectId: id,
  createdAt: time,
  createdBy: id,
  knowledge: parseApiSpec(
    readFileSync('packages/qa-intelligence/tests/fixtures/qa.json', 'utf8'),
    'json',
  ).knowledge,
};
const snapshot = {
  id,
  createdAt: time,
  createdBy: id,
  graph: buildBehaviourGraph(source),
};
const input = deriveQa({ source, snapshot });
const analysis: QaAnalysis = {
  ...input,
  id,
  createdAt: time,
  createdBy: id,
  records: input.items.map((p, i) => ({
    ...p,
    id: String(i),
    analysisId: id,
    createdAt: time,
    createdBy: id,
    reviews: [],
  })),
};
it('renders exact source, human review counts and unconfigured AI separately', () => {
  const html = renderToStaticMarkup(
    <IntelligenceView
      analysis={analysis}
      graph={snapshot}
      kind="REQUIREMENT"
      role="OWNER"
    />,
  );
  expect(html).toContain('Analysis summary');
  expect(html).toContain('unavailable / not configured');
  expect(html).toContain('Awaiting review:');
  expect(html).toContain('Add human requirement');
  expect(html).toContain('Import');
  expect(html).toContain('Graph');
  expect(html).not.toContain('Executed');
});
it('renders real risk severity distribution and manual risk control', () => {
  const html = renderToStaticMarkup(
    <IntelligenceView
      analysis={analysis}
      graph={snapshot}
      kind="RISK"
      role="MEMBER"
    />,
  );
  expect(html).toContain('Severity:');
  expect(html).toContain('HIGH');
  expect(html).toContain('Add human risk');
});
it('keeps imported proposal titles inert in HTML', () => {
  const a = structuredClone(analysis);
  a.records[0]!.title = '<script>approve()</script>';
  const html = renderToStaticMarkup(
    <IntelligenceView
      analysis={a}
      graph={snapshot}
      kind="REQUIREMENT"
      role="OWNER"
    />,
  );
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>approve()');
});
it('shows AI failure without removing deterministic review proposals', () => {
  const a = {
    ...analysis,
    aiStatus: 'FAILED' as const,
    aiFailure: 'AI unavailable; deterministic proposals preserved.',
  };
  const html = renderToStaticMarkup(
    <IntelligenceView
      analysis={a}
      graph={snapshot}
      kind="REQUIREMENT"
      role="OWNER"
    />,
  );
  expect(html).toContain('AI unavailable; deterministic proposals preserved.');
  expect(html).toContain('PROPOSED');
});
