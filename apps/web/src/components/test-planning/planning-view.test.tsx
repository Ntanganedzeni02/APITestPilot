import { projectSpecifications } from '../../../../../packages/ai/tests/multi-project-fixtures';
import { groundedPlanningCatalog } from '@testpilot/ai';
import { generateTestPlan } from '@testpilot/test-engine';
import { context } from '../../../../../packages/ai/tests/planning-fixture';
import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect, vi } from 'vitest';
import {
  PlanningView,
  filterPlanningItems,
  readinessLabel,
} from './planning-view';
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
  expect(html).toContain('Standard planning');
  expect(html).toContain('Technical details and provenance');
  expect(html).toContain(
    'Planning records contain no runtime results; see Runs for observed execution',
  );
  expect(html).toContain(
    'This historical plan snapshot has no approved requirements.',
  );
  expect(html).not.toContain('0/0');
  expect(html).toContain('Execution-ready cases');
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
  expect(html).toContain('Request changes');
  expect(html).not.toContain('value="APPROVE"');
  expect(html).not.toContain('value="REJECT"');
});

const scenario: TestItem = {
  id,
  planId: id,
  logicalKey: 'scenario-fixture',
  kind: 'SCENARIO',
  scenarioKey: null,
  title: 'Verify catalog list',
  objective: 'Review catalog contract',
  testType: 'CONTRACT',
  caseType: null,
  priority: 'HIGH',
  priorityReason: 'Declared requirement',
  origin: 'DETERMINISTIC',
  derivationType: 'DETERMINISTIC_INFERENCE',
  confidence: 'EXACT',
  ruleId: 'TEST_FIXTURE',
  reason: 'Fixture for offline regression',
  requirementRefs: [],
  riskRefs: [],
  nodeRefs: [],
  edgeRefs: [],
  sourcePointers: ['#/paths'],
  preconditions: [],
  input: { strategy: 'DECLARED_TYPE', pointer: null, value: null },
  expectedBehavior: 'Declared response matches contract',
  executable: false,
  createdAt: graph.createdAt,
  createdBy: id,
  reviews: [],
};
const filters = {
  status: 'ALL',
  origin: 'ALL',
  priority: 'ALL',
  type: 'ALL',
  reference: '',
  eligibility: 'ALL',
};
it('scenario summary exposes readable status, category and non-executable readiness', () => {
  const html = renderToStaticMarkup(
    <PlanningView
      plan={{ ...plan, records: [scenario] }}
      graph={graph}
      role="OWNER"
    />,
  );
  expect(html).toContain('Verify catalog list');
  expect(html).toContain('Review only - cannot execute');
  expect(html).toContain('Contract');
  expect(html).toContain('Human review');
  expect(html).toContain('Objective');
  expect(html).toContain('Expected result');
  expect(html).not.toContain('<details open');
  expect(html).toContain('Technical details');
  expect(html).toContain('Symbolic input');
});
it('tab deep link renders cases and exposes accessible active panel', () => {
  const item = {
    ...scenario,
    id: '16000000-0000-0000-0000-000000000002',
    kind: 'CASE' as const,
    scenarioKey: scenario.logicalKey,
  };
  const html = renderToStaticMarkup(
    <PlanningView
      plan={{ ...plan, records: [scenario, item] }}
      graph={graph}
      role="OWNER"
      initialView="CASE"
    />,
  );
  expect(html).toContain('role="tablist"');
  expect(html).toContain(
    'id="planning-tab-CASE" role="tab" aria-selected="true"',
  );
  expect(html).toContain('role="tabpanel"');
  expect(html).toContain('Expected: Declared response matches contract');
  expect(html).toContain('Open safety preview');
});
it('coverage keeps a zero denominator unavailable despite existing scenarios', () => {
  const html = renderToStaticMarkup(
    <PlanningView
      plan={{ ...plan, records: [scenario] }}
      graph={graph}
      role="OWNER"
      initialView="COVERAGE"
    />,
  );
  expect(html).toContain('This plan saved no approved requirements.');
  expect(html).not.toContain('0/0');
  expect(html).toContain('not verified coverage or execution evidence');
});
it('all existing filters retain semantics and non-executable cannot match ready cases', () => {
  const fixture = { ...plan, records: [scenario] };
  expect(filterPlanningItems(fixture, 'SCENARIO', filters)).toHaveLength(1);
  expect(
    filterPlanningItems(fixture, 'SCENARIO', {
      ...filters,
      priority: 'ROUTINE',
    }),
  ).toHaveLength(0);
  expect(
    filterPlanningItems(fixture, 'SCENARIO', {
      ...filters,
      status: 'APPROVED',
    }),
  ).toHaveLength(0);
  expect(
    filterPlanningItems(fixture, 'SCENARIO', {
      ...filters,
      origin: 'AI_PROPOSED',
    }),
  ).toHaveLength(0);
  expect(
    filterPlanningItems(fixture, 'SCENARIO', { ...filters, type: 'SECURITY' }),
  ).toHaveLength(0);
  expect(
    filterPlanningItems(fixture, 'SCENARIO', {
      ...filters,
      reference: 'foreign',
    }),
  ).toHaveLength(0);
  expect(
    filterPlanningItems(fixture, 'SCENARIO', {
      ...filters,
      eligibility: 'APPROVED_FOR_EXECUTION',
    }),
  ).toHaveLength(0);
  expect(readinessLabel('NON_EXECUTABLE')).toBe('Review only - cannot execute');
});
it('traceability presents readable relationships and missing coverage separately', () => {
  const requirement = {
    id,
    status: 'PROPOSED' as const,
    title: 'Catalog requirement',
    statement: 'Declared contract',
    reviewId: null,
    sourceKind: 'SPEC_EXPLICIT' as const,
    hasEdits: false,
  };
  const html = renderToStaticMarkup(
    <PlanningView
      plan={{ ...plan, requirements: [requirement], records: [] }}
      graph={graph}
      role="OWNER"
      initialView="TRACEABILITY"
    />,
  );
  expect(html).toContain('Catalog requirement - Proposed');
  expect(html).toContain('No active scenarios linked');
  expect(html).toContain('Technical references');
});

it('two approved snapshot requirements with no links show zero coverage rather than unavailable or no approvals', () => {
  const p = {
    ...plan,
    requirements: [1, 2].map((n) => ({
      id: id.slice(0, -1) + n,
      reviewId: id,
      status: 'APPROVED' as const,
      title: 'Requirement ' + n,
      statement: 'Declared contract',
    })),
  };
  const html = renderToStaticMarkup(
    <PlanningView plan={p} graph={graph} role="OWNER" initialView="COVERAGE" />,
  );
  expect(html).toContain('0 of 2');
  expect(html).not.toContain('No approved snapshot requirements');
  expect(html).not.toContain('This plan saved no approved requirements');
});

it('a valid model-shaped plan displays its AI scenario and case as pending non-executable proposals', async () => {
  const c = context(),
    catalog = groundedPlanningCatalog(c);
  const scenario = {
    key: 'ai-scenario',
    scenarioRef: null,
    title: 'AI grounded scenario',
    objective: 'Review the declared contract.',
    testType: 'CONTRACT',
    caseType: null,
    requirementRefs: [catalog.request.data.requirements[0]!.token],
    riskRefs: [],
    evidenceRefs: [catalog.operations[0]!.token],
    reason: 'Approved requirement and declared operation.',
    expectedBehavior: 'Compare only with the declared specification.',
    preconditions: [],
    requestIntent: 'Review only; no execution.',
  };
  const generated = await generateTestPlan(c, {
    providerId: 'openai',
    modelId: 'gpt-4.1-mini',
    plan: async () => ({
      proposals: [
        scenario,
        {
          ...scenario,
          key: 'ai-case',
          scenarioRef: scenario.key,
          caseType: 'VALID',
          title: 'AI grounded case',
        },
      ],
    }),
  });
  expect(generated.aiStatus).toBe('SUCCEEDED');
  const persisted: TestPlan = {
    ...generated,
    id,
    createdAt: c.source.createdAt,
    createdBy: c.source.createdBy,
    records: generated.items.map((item, n) => ({
      ...item,
      id: '16000000-0000-0000-0000-' + String(n + 2000).padStart(12, '0'),
      planId: id,
      createdAt: c.source.createdAt,
      createdBy: c.source.createdBy,
      reviews: [],
    })),
  };
  for (const [tab, title] of [
    ['SCENARIO', 'AI grounded scenario'],
    ['CASE', 'AI grounded case'],
  ]) {
    const html = renderToStaticMarkup(
      <PlanningView
        plan={{
          ...persisted,
          records: filterPlanningItems(persisted, tab!, {
            status: 'ALL',
            origin: 'AI_PROPOSED',
            priority: 'ALL',
            type: 'ALL',
            reference: '',
            eligibility: 'ALL',
          }),
        }}
        graph={c.snapshot}
        role="OWNER"
        initialView={tab}
      />,
    );
    expect(html).toContain(title!);
    expect(html).toContain('Proposed');
  }
  expect(
    persisted.records
      .filter((i) => i.origin === 'AI_PROPOSED')
      .every((i) => !i.executable),
  ).toBe(true);
});

it.each(projectSpecifications)(
  'displays pending non-executable AI proposals for $name independently',
  async (fixture) => {
    const c = context(
      JSON.stringify(fixture.document),
      projectSpecifications.indexOf(fixture) * 10000,
    );
    const catalog = groundedPlanningCatalog(c);
    const output = {
      key: 'scenario',
      scenarioRef: null,
      title: fixture.name + ' review',
      objective: 'Review the declared operation contract.',
      testType: 'CONTRACT',
      caseType: null,
      requirementRefs: [catalog.request.data.requirements[0]!.token],
      riskRefs: [],
      evidenceRefs: [catalog.operations[0]!.token],
      reason: 'Approved specification requirement.',
      expectedBehavior: 'Compare only against the declared specification.',
      preconditions: [],
      requestIntent: 'Review before any execution authorization.',
    };
    const generated = await generateTestPlan(c, {
      providerId: 'synthetic',
      modelId: 'model-shaped-fixture',
      plan: async () => ({ proposals: [output] }),
    });
    expect(generated.aiStatus).toBe('SUCCEEDED');
    const persisted: TestPlan = {
      ...generated,
      id,
      createdAt: c.source.createdAt,
      createdBy: c.source.createdBy,
      records: generated.items.map((item, n) => ({
        ...item,
        id: '16000000-0000-0000-0000-' + String(n + 2000).padStart(12, '0'),
        planId: id,
        createdAt: c.source.createdAt,
        createdBy: c.source.createdBy,
        reviews: [],
      })),
    };
    const html = renderToStaticMarkup(
      <PlanningView plan={persisted} graph={c.snapshot} role="OWNER" />,
    );
    expect(html).toContain(fixture.name + ' review');
    expect(html).toContain('Proposed');
    expect(persisted.analysisId).toBe(c.analysis.id);
    expect(persisted.projectId).toBe(c.source.projectId);
    expect(
      persisted.records
        .filter((i) => i.origin === 'AI_PROPOSED')
        .every((i) => !i.executable),
    ).toBe(true);
  },
);
