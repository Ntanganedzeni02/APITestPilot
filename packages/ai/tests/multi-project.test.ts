import { describe, expect, it } from 'vitest';
import { context } from './planning-fixture.js';
import { projectSpecifications } from './multi-project-fixtures.js';
import {
  groundedPlanningCatalog,
  validateGroundedPlanning,
} from '../src/grounding.js';
import { validateStructuredOutput } from '../src/server.js';
import { generateTestPlan } from '../../test-engine/src/index.js';
import { assertTestPlan, reviewState } from '@testpilot/domain';
import { parseApiSpec, SpecError } from '../../api-spec/src/index.js';
function proposal(catalog: ReturnType<typeof groundedPlanningCatalog>) {
  return {
    key: 'scenario',
    scenarioRef: null,
    title: 'Review the declared contract',
    objective: 'Compare the operation with its approved requirement.',
    testType: 'CONTRACT',
    caseType: null,
    requirementRefs: [catalog.request.data.requirements[0]!.token],
    riskRefs: [],
    evidenceRefs: [catalog.operations[0]!.token],
    reason: 'Declared specification evidence needs review.',
    expectedBehavior:
      'Use only the declared response contract; runtime behavior is unverified.',
    preconditions: [],
    requestIntent: 'Review the specification before authorizing execution.',
  };
}
describe.each(projectSpecifications)(
  '$name project-independent AI pipeline',
  (fixture) => {
    const input = () =>
      context(
        JSON.stringify(fixture.document),
        projectSpecifications.indexOf(fixture) * 10000,
      );
    it('uses this project?s operations and approved requirements, without execution configuration', async () => {
      const c = input(),
        catalog = groundedPlanningCatalog(c);
      expect(
        c.analysis.records.filter(
          (r) =>
            r.kind === 'REQUIREMENT' && reviewState(r).status === 'APPROVED',
        ).length,
      ).toBeGreaterThan(0);
      expect(catalog.operations.map((o) => o.route).sort()).toEqual(
        c.source.knowledge.operations.map((o) => o.path).sort(),
      );
      expect(JSON.stringify(catalog.request.data)).not.toMatch(
        /catalog|executionBase|workspaceId|projectId/,
      );
      const scenario = proposal(catalog);
      const output = {
        proposals: [
          scenario,
          {
            ...scenario,
            key: 'case',
            scenarioRef: 'scenario',
            caseType: 'VALID',
            title: 'Review a declared contract case',
          },
        ],
      };
      expect(
        validateStructuredOutput(output, catalog.request.outputSchema),
      ).toBe(true);
      expect(validateGroundedPlanning(output, catalog)).toHaveLength(2);
      const plan = await generateTestPlan(c, {
        providerId: 'synthetic',
        modelId: 'model-shaped-fixture',
        plan: async () => output,
      });
      expect(plan.aiStatus).toBe('SUCCEEDED');
      expect(() => assertTestPlan(plan)).not.toThrow();
      expect(plan.projectId).toBe(c.source.projectId);
      expect(plan.analysisId).toBe(c.analysis.id);
      expect(
        plan.items
          .filter((i) => i.origin === 'AI_PROPOSED')
          .every((i) => !i.executable),
      ).toBe(true);
      expect(
        plan.items
          .filter((i) => i.origin === 'AI_PROPOSED')
          .every((i) =>
            i.requirementRefs.every((id) =>
              c.analysis.records.some((r) => r.id === id),
            ),
          ),
      ).toBe(true);
    });
    it('rejects unknown references and undeclared HTTP assertions with diagnostics', () => {
      const catalog = groundedPlanningCatalog(input());
      for (const field of ['requirementRefs', 'evidenceRefs']) {
        const p = proposal(catalog);
        Object.assign(p, { [field]: ['unknown-project-reference'] });
        expect(() =>
          validateGroundedPlanning({ proposals: [p] }, catalog),
        ).toThrow(
          expect.objectContaining({
            diagnostic: expect.objectContaining({ stage: 'GROUNDING' }),
          }),
        );
      }
      const p = proposal(catalog);
      p.expectedBehavior = 'Expect HTTP 418';
      expect(() =>
        validateGroundedPlanning({ proposals: [p] }, catalog),
      ).toThrow(
        expect.objectContaining({
          diagnostic: expect.objectContaining({
            rule: 'UNDECLARED_HTTP_STATUS',
          }),
        }),
      );
    });
    it('unreviewed requirements cannot satisfy admission prerequisites', () => {
      const c = input();
      c.analysis.records.forEach((r) => {
        r.reviews = [];
      });
      expect(() => groundedPlanningCatalog(c)).toThrow('Approved');
    });
  },
);
it('retains authentication, path/query constraints and POST/PUT request shapes in project-specific prompts', () => {
  const library = groundedPlanningCatalog(
    context(JSON.stringify(projectSpecifications[1]!.document)),
  );
  expect(library.operations[0]).toMatchObject({
    securityRequired: true,
    parameters: [
      { location: 'path', required: true, schema: { minLength: 10 } },
      { location: 'query', required: false, schema: { minimum: 1 } },
    ],
  });
  const mutations = groundedPlanningCatalog(
    context(JSON.stringify(projectSpecifications[2]!.document)),
  );
  expect(mutations.operations.map((o) => o.method).sort()).toEqual([
    'POST',
    'PUT',
  ]);
  expect(
    mutations.operations.every(
      (o) => o.requestRequired && o.requestSchemas.length > 0,
    ),
  ).toBe(true);
});
it('inline response requirements cite actual operation/schema graph facts and source pointers', () => {
  const c = context(JSON.stringify(projectSpecifications[0]!.document));
  const requirements = c.analysis.records.filter(
    (r) => r.kind === 'REQUIREMENT',
  );
  expect(requirements).toHaveLength(1);
  expect(requirements[0]).toMatchObject({
    ruleId: 'REQ_RESPONSE_SCHEMA',
    sourceKind: 'SPEC_EXPLICIT',
  });
  expect(requirements[0]!.sourcePointers).toContain(
    '#/paths/~1observations/get/responses/200/content/application~1json/schema',
  );
  expect(
    requirements[0]!.nodeRefs.every((id) =>
      c.snapshot.graph.nodes.some((n) => n.id === id),
    ),
  ).toBe(true);
  expect(
    requirements[0]!.edgeRefs.every((id) =>
      c.snapshot.graph.edges.some((e) => e.id === id),
    ),
  ).toBe(true);
});
it('rejects mixing independently scoped project contexts before AI admission', () => {
  const a = context(JSON.stringify(projectSpecifications[0]!.document));
  const b = context(JSON.stringify(projectSpecifications[1]!.document), 10000);
  expect(() => groundedPlanningCatalog({ ...a, analysis: b.analysis })).toThrow(
    'scope',
  );
  expect(() =>
    groundedPlanningCatalog({ ...a, snapshot: b.snapshot }),
  ).toThrow();
});
it.each(['{invalid', '{"swagger":"2.0"}', '{"openapi":"3.2.0"}'])(
  'invalid or unsupported specifications fail with actionable parser errors: %s',
  (text) => {
    expect(() => parseApiSpec(text, 'json')).toThrow(SpecError);
  },
);

it.each(['EDIT', 'REJECT'] as const)(
  'requirements with a latest %s decision do not satisfy AI eligibility',
  (decision) => {
    const c = context(JSON.stringify(projectSpecifications[0]!.document));
    for (const r of c.analysis.records.filter(
      (r) => r.kind === 'REQUIREMENT',
    )) {
      const previous = r.reviews[0]!;
      r.reviews.push({
        ...previous,
        revision: 2,
        decision,
        title: decision === 'EDIT' ? 'Revised contract' : null,
        statement: decision === 'EDIT' ? 'Needs fresh review.' : null,
      });
    }
    expect(() => groundedPlanningCatalog(c)).toThrow('Approved');
  },
);
