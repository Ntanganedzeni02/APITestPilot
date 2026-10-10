import {
  ValidationError,
  validateId,
  reviewState,
  type QaAnalysis,
  type QaReview,
  type QaContext,
  type QaStatus,
} from './index.js';
export const testTypes = [
  'FUNCTIONAL',
  'VALIDATION',
  'AUTHENTICATION',
  'AUTHORIZATION',
  'CONTRACT',
  'STATE',
  'DEPENDENCY',
  'ERROR_HANDLING',
  'SECURITY',
] as const;
export const caseTypes = [
  'VALID',
  'MISSING_REQUIRED',
  'INVALID_TYPE',
  'VALID_FORMAT',
  'INVALID_FORMAT',
  'ENUM_VALID',
  'ENUM_INVALID',
  'BOUNDARY_MIN',
  'BOUNDARY_MAX',
  'BELOW_MIN',
  'ABOVE_MAX',
  'UNAUTHORIZED',
  'DECLARED_ERROR_RESPONSE',
  'DEPENDENCY_SETUP',
  'STATE_VALUE',
  'INVESTIGATION',
  'CUSTOM',
] as const;
export type PlanningOrigin = 'DETERMINISTIC' | 'AI_PROPOSED' | 'HUMAN_AUTHORED';
export type Eligibility =
  | 'REVIEW_REQUIRED'
  | 'APPROVED_FOR_EXECUTION'
  | 'NON_EXECUTABLE'
  | 'BLOCKED_BY_DEPENDENCY';
export interface PlanningContext extends QaContext {
  analysis: QaAnalysis;
}
export interface RequirementVersion {
  id: string;
  reviewId: string | null;
  status: QaStatus;
  title: string;
  statement: string;
}
export interface PlanningItem {
  logicalKey: string;
  kind: 'SCENARIO' | 'CASE';
  scenarioKey: string | null;
  title: string;
  objective: string;
  testType: (typeof testTypes)[number];
  caseType: (typeof caseTypes)[number] | null;
  priority: 'ROUTINE' | 'HIGH' | 'URGENT';
  priorityReason: string;
  origin: PlanningOrigin;
  derivationType:
    'DETERMINISTIC_INFERENCE' | 'AI_INFERENCE' | 'HUMAN' | 'HUMAN_SOURCE';
  confidence: 'EXACT' | 'STRONG' | 'SUPPORTED';
  ruleId: string;
  reason: string;
  requirementRefs: string[];
  riskRefs: string[];
  nodeRefs: string[];
  edgeRefs: string[];
  sourcePointers: string[];
  preconditions: {
    kind: 'AUTH_REQUIRED' | 'IDENTIFIER_FROM_OPERATION' | 'APPROVED_TEST_DATA';
    reference: string | null;
  }[];
  input: {
    strategy: string;
    pointer: string | null;
    value: number | string | boolean | null;
  };
  expectedBehavior: string;
  executable: boolean;
}
export interface TestPlanInput {
  workspaceId: string;
  projectId: string;
  importId: string;
  graphId: string;
  analysisId: string;
  engineVersion: string;
  status: 'DRAFT';
  aiStatus: 'NOT_CONFIGURED' | 'SUCCEEDED' | 'FAILED';
  aiMetadata: { provider: string; model: string; promptVersion: string } | null;
  aiFailure: string | null;
  requirements: RequirementVersion[];
  items: PlanningItem[];
}
export interface TestReview {
  id: string;
  itemId: string;
  actorId: string;
  createdAt: string;
  revision: number;
  decision: QaReview['decision'];
  rationale: string;
  title: string | null;
  objective: string | null;
  expectedBehavior: string | null;
}
export interface TestItem extends PlanningItem {
  id: string;
  planId: string;
  createdAt: string;
  createdBy: string;
  reviews: TestReview[];
}
export interface TestPlan extends TestPlanInput {
  id: string;
  createdAt: string;
  createdBy: string;
  records: TestItem[];
}
export interface TestPlanRepository {
  save(input: TestPlanInput): Promise<string>;
  list(workspaceId: string, projectId: string): Promise<TestPlan[]>;
  review(
    itemId: string,
    expectedReviewId: string | null,
    decision: TestReview['decision'],
    rationale: string,
    title: string | null,
    objective: string | null,
    expectedBehavior: string | null,
  ): Promise<string>;
  add(planId: string, item: PlanningItem): Promise<string>;
}
export const PLANNING_LIMITS = {
  items: 2000,
  scenarios: 500,
  refs: 30,
  bytes: 4194304,
  aiItems: 30,
} as const;
export function planningState(item: TestItem) {
  let status: QaStatus = 'PROPOSED',
    title = item.title,
    objective = item.objective,
    expectedBehavior = item.expectedBehavior;
  for (const r of item.reviews) {
    if (r.decision === 'EDIT') {
      title = r.title!;
      objective = r.objective!;
      expectedBehavior = r.expectedBehavior!;
      status = 'PROPOSED';
    } else status = r.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  }
  return { status, title, objective, expectedBehavior };
}
export function executionEligibility(
  item: TestItem,
  plan: TestPlan,
): Eligibility {
  if (
    !item.executable ||
    item.kind !== 'CASE' ||
    planningState(item).status === 'REJECTED'
  )
    return 'NON_EXECUTABLE';
  const versions = new Map(plan.requirements.map((r) => [r.id, r]));
  const parent = plan.records.find((r) => r.logicalKey === item.scenarioKey);
  if (
    planningState(item).status !== 'APPROVED' ||
    !parent ||
    planningState(parent).status !== 'APPROVED' ||
    item.requirementRefs.some((id) => versions.get(id)?.status !== 'APPROVED')
  )
    return 'REVIEW_REQUIRED';
  if (item.preconditions.length) return 'BLOCKED_BY_DEPENDENCY';
  return 'APPROVED_FOR_EXECUTION';
}
export function requirementVersions(
  analysis: QaAnalysis,
): RequirementVersion[] {
  return analysis.records
    .filter((r) => r.kind === 'REQUIREMENT')
    .map((r) => {
      const state = reviewState(r);
      return { id: r.id, reviewId: r.reviews.at(-1)?.id ?? null, ...state };
    });
}
export function assertPlanningItem(v: PlanningItem) {
  const text = (s: unknown, n: number) =>
    typeof s === 'string' && s.trim().length > 0 && s.length <= n;
  const refs = (a: unknown) =>
    Array.isArray(a) &&
    a.length <= 30 &&
    new Set(a).size === a.length &&
    a.every((s) => text(s, 2000));
  if (
    !v ||
    !['SCENARIO', 'CASE'].includes(v.kind) ||
    !text(v.logicalKey, 2000) ||
    !text(v.title, 160) ||
    !text(v.objective, 4000) ||
    !text(v.expectedBehavior, 4000) ||
    !text(v.reason, 2000) ||
    !text(v.priorityReason, 2000) ||
    !testTypes.includes(v.testType) ||
    !['ROUTINE', 'HIGH', 'URGENT'].includes(v.priority) ||
    !['DETERMINISTIC', 'AI_PROPOSED', 'HUMAN_AUTHORED'].includes(v.origin) ||
    v.derivationType !==
      (
        {
          DETERMINISTIC: 'DETERMINISTIC_INFERENCE',
          AI_PROPOSED: 'AI_INFERENCE',
          HUMAN_AUTHORED:
            v.derivationType === 'HUMAN_SOURCE' ? 'HUMAN_SOURCE' : 'HUMAN',
        } as const
      )[v.origin] ||
    !['EXACT', 'STRONG', 'SUPPORTED'].includes(v.confidence) ||
    (v.origin !== 'DETERMINISTIC' && v.confidence !== 'SUPPORTED') ||
    !/^TEST_[A-Z0-9_]{1,70}$/.test(v.ruleId) ||
    !refs(v.requirementRefs) ||
    !v.requirementRefs.length ||
    !refs(v.riskRefs) ||
    !refs(v.nodeRefs) ||
    !v.nodeRefs.length ||
    !refs(v.edgeRefs) ||
    !refs(v.sourcePointers) ||
    !v.sourcePointers.length ||
    typeof v.executable !== 'boolean' ||
    (v.kind === 'CASE'
      ? !v.scenarioKey || !caseTypes.includes(v.caseType!)
      : v.scenarioKey !== null || v.caseType !== null) ||
    !Array.isArray(v.preconditions) ||
    v.preconditions.length > 10 ||
    v.preconditions.some(
      (p) =>
        ![
          'AUTH_REQUIRED',
          'IDENTIFIER_FROM_OPERATION',
          'APPROVED_TEST_DATA',
        ].includes(p.kind) ||
        (p.reference !== null && !text(p.reference, 2000)) ||
        (p.kind === 'IDENTIFIER_FROM_OPERATION' &&
          (p.reference === null || !v.edgeRefs.includes(p.reference))),
    ) ||
    !v.input ||
    !text(v.input.strategy, 80) ||
    (v.input.pointer !== null && !text(v.input.pointer, 2000)) ||
    !(
      v.input.value === null ||
      typeof v.input.value === 'boolean' ||
      (typeof v.input.value === 'number' && Number.isFinite(v.input.value)) ||
      (typeof v.input.value === 'string' && v.input.value.length <= 200)
    )
  )
    throw new ValidationError('Invalid bounded planning item.');
}
export function assertTestPlan(v: TestPlanInput) {
  for (const id of [
    v.workspaceId,
    v.projectId,
    v.importId,
    v.graphId,
    v.analysisId,
  ])
    validateId(id);
  for (const r of v.requirements) {
    validateId(r.id);
    if (r.reviewId !== null) validateId(r.reviewId);
    if (
      !['PROPOSED', 'APPROVED', 'REJECTED'].includes(r.status) ||
      typeof r.title !== 'string' ||
      !r.title.trim() ||
      r.title.length > 160 ||
      typeof r.statement !== 'string' ||
      !r.statement.trim() ||
      r.statement.length > 4000
    )
      throw new ValidationError('Invalid pinned requirement version.');
  }
  if (
    v.aiStatus === 'SUCCEEDED'
      ? !v.aiMetadata ||
        Object.keys(v.aiMetadata).length !== 3 ||
        Object.values(v.aiMetadata).some(
          (s) => typeof s !== 'string' || !s.trim() || s.length > 200,
        )
      : v.aiMetadata !== null
  )
    throw new ValidationError('Invalid planning AI metadata.');
  if (
    !v ||
    v.status !== 'DRAFT' ||
    v.engineVersion !== '1.0.0' ||
    !['NOT_CONFIGURED', 'SUCCEEDED', 'FAILED'].includes(v.aiStatus) ||
    v.items.length > 2000 ||
    v.items.filter((i) => i.kind === 'SCENARIO').length > 500 ||
    v.items.filter((i) => i.origin === 'AI_PROPOSED').length > 30 ||
    Array.from(JSON.stringify(v)).reduce((bytes, c) => {
      const p = c.codePointAt(0)!;
      return bytes + (p < 128 ? 1 : p < 2048 ? 2 : p < 65536 ? 3 : 4);
    }, 0) > 4194304 ||
    v.requirements.length > 1000
  )
    throw new ValidationError('Invalid test plan.');
  const req = new Map(v.requirements.map((r) => [r.id, r]));
  const keys = new Map(v.items.map((i) => [i.logicalKey, i]));
  if (req.size !== v.requirements.length || keys.size !== v.items.length)
    throw new ValidationError('Duplicate planning identity.');
  for (const i of v.items) {
    assertPlanningItem(i);
    if (
      i.requirementRefs.some(
        (id) => !req.has(id) || req.get(id)!.status === 'REJECTED',
      ) ||
      (i.kind === 'CASE' &&
        (keys.get(i.scenarioKey!)?.kind !== 'SCENARIO' ||
          i.requirementRefs.some(
            (id) => !keys.get(i.scenarioKey!)!.requirementRefs.includes(id),
          )))
    )
      throw new ValidationError('Disconnected planning evidence.');
  }
}
export function planningCoverage(
  plan: TestPlan,
  operationNodes: string[] = [],
) {
  const active = plan.records.filter(
    (i) => planningState(i).status !== 'REJECTED',
  );
  const scenarios = active.filter((i) => i.kind === 'SCENARIO'),
    cases = active.filter((i) => i.kind === 'CASE');
  const covered = new Set(scenarios.flatMap((s) => s.requirementRefs));
  return {
    approvedRequirements: plan.requirements.filter(
      (r) => r.status === 'APPROVED',
    ).length,
    coveredRequirements: plan.requirements.filter(
      (r) => r.status === 'APPROVED' && covered.has(r.id),
    ).length,
    uncoveredRequirements: plan.requirements.filter(
      (r) => r.status === 'APPROVED' && !covered.has(r.id),
    ),
    linkedRisks: [...new Set(active.flatMap((i) => i.riskRefs))],
    uncoveredOperations: operationNodes.filter(
      (id) => !active.some((i) => i.nodeRefs.includes(id)),
    ),
    scenarios: scenarios.length,
    cases: cases.length,
    approvedCases: cases.filter((c) => planningState(c).status === 'APPROVED')
      .length,
    executionEligible: cases.filter(
      (c) => executionEligibility(c, plan) === 'APPROVED_FOR_EXECUTION',
    ).length,
    blocked: cases.filter(
      (c) => executionEligibility(c, plan) === 'BLOCKED_BY_DEPENDENCY',
    ).length,
  };
}
export function traceabilityRows(plan: TestPlan) {
  return plan.requirements.map((requirement) => ({
    requirement,
    scenarios: plan.records.filter(
      (i) =>
        i.kind === 'SCENARIO' && i.requirementRefs.includes(requirement.id),
    ),
    cases: plan.records.filter(
      (i) => i.kind === 'CASE' && i.requirementRefs.includes(requirement.id),
    ),
    riskRefs: [
      ...new Set(
        plan.records
          .filter((i) => i.requirementRefs.includes(requirement.id))
          .flatMap((i) => i.riskRefs),
      ),
    ],
  }));
}
export function planningItemsBy(
  plan: TestPlan,
  field: 'requirementRefs' | 'riskRefs' | 'nodeRefs' | 'scenarioKey',
  value: string,
) {
  return plan.records.filter((i) =>
    field === 'scenarioKey'
      ? i.scenarioKey === value
      : i[field].includes(value),
  );
}

export const approvedTestCases = (plan: TestPlan) =>
  plan.records.filter(
    (i) => i.kind === 'CASE' && planningState(i).status === 'APPROVED',
  );
export const reviewRequiredTestCases = (plan: TestPlan) =>
  plan.records.filter(
    (i) =>
      i.kind === 'CASE' && executionEligibility(i, plan) === 'REVIEW_REQUIRED',
  );
export const executionEligibleTestCases = (plan: TestPlan) =>
  plan.records.filter(
    (i) => executionEligibility(i, plan) === 'APPROVED_FOR_EXECUTION',
  );
