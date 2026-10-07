import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect, vi } from 'vitest';
import { PlanningView } from './planning-view';
import type { TestPlan, GraphSnapshot, TestItem } from '@testpilot/domain';
vi.mock('./action-form', () => ({
  PlanningActionForm: ({
    children,
    label,
  }: {
    children: React.ReactNode;
    label: string;
  }) => (
    <div>
      {children}
      <button>{label}</button>
    </div>
  ),
}));
const id = '16000000-0000-0000-0000-000000000001';
const graph: GraphSnapshot = {
  id,
  createdAt: '2026-10-07T00:00:00Z',
  createdBy: id,
  graph: {
    modelVersion: 1,
    builderVersion: '1.0.0',
    workspaceId: id,
    projectId: id,
    importId: id,
    nodes: [],
    edges: [],
  },
};
const plan: TestPlan = {
  id,
  workspaceId: id,
  projectId: id,
  importId: id,
  graphId: id,
  analysisId: id,
  engineVersion: '1.0.0',
  status: 'DRAFT',
  aiStatus: 'NOT_CONFIGURED',
  aiMetadata: null,
  aiFailure: null,
  createdAt: graph.createdAt,
  createdBy: id,
  requirements: [],
  items: [],
  records: [],
};
it('truthful empty planning summary without runtime results or fake scores', () => {
  const html = renderToStaticMarkup(
    <PlanningView plan={plan} graph={graph} role="OWNER" />,
  );
  expect(html).toContain('unavailable / not configured');
  expect(html).toContain(
    'Planning records contain no runtime results; see Runs for observed execution',
  );
  expect(html).toContain('0 scenarios');
  expect(html).not.toContain('93%');
});
it('member never receives approval controls and untrusted text is escaped', () => {
  const item = {
    id,
    planId: id,
    logicalKey: 'scenario',
    kind: 'SCENARIO',
    scenarioKey: null,
    title: '<script>approve()</script>',
    objective: 'untrusted data',
    testType: 'CONTRACT',
    caseType: null,
    priority: 'ROUTINE',
    priorityReason: 'fixture',
    origin: 'DETERMINISTIC',
    derivationType: 'DETERMINISTIC_INFERENCE',
    confidence: 'EXACT',
    ruleId: 'TEST_FIXTURE',
    reason: 'fixture',
    requirementRefs: [],
    riskRefs: [],
    nodeRefs: [],
    edgeRefs: [],
    sourcePointers: [],
    preconditions: [],
    input: { strategy: 'DECLARED_TYPE', pointer: null, value: null },
    expectedBehavior: 'No runtime claim',
    executable: false,
    createdAt: graph.createdAt,
    createdBy: id,
    reviews: [],
  } as TestItem;
  const html = renderToStaticMarkup(
    <PlanningView
      plan={{ ...plan, records: [item] }}
      graph={graph}
      role="MEMBER"
    />,
  );
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<option>APPROVE</option>');
  expect(html).not.toContain('<option>REJECT</option>');
  expect(html).toContain('<option>EDIT</option>');
});
