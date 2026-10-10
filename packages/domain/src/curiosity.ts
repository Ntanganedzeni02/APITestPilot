import {
  ValidationError,
  validateId,
  containsRecognizableCredential,
} from './index.js';
export const investigationStatuses = [
  'OPEN',
  'WAITING_FOR_APPROVAL',
  'RUNNING',
  'CONCLUDED',
  'STOPPED',
] as const;
export type InvestigationStatus = (typeof investigationStatuses)[number];
export type InvestigationTrigger =
  | 'FINDING'
  | 'FAILED_ASSERTION'
  | 'UNEXPECTED_RESPONSE'
  | 'INFRASTRUCTURE_OBSERVATION'
  | 'MANUAL_INVESTIGATION_REQUEST';
export type ProposalStatus =
  | 'PROPOSED'
  | 'APPROVED'
  | 'REJECTED'
  | 'BLOCKED'
  | 'MATERIALIZED'
  | 'EXECUTED';
export type InvestigationConclusion =
  | 'HYPOTHESIS_SUPPORTED'
  | 'HYPOTHESIS_NOT_SUPPORTED'
  | 'INCONCLUSIVE'
  | 'STOPPED_BY_POLICY'
  | 'BUDGET_EXHAUSTED';
export const repeatabilityHypothesis =
  'Repeat the selected case to assess its declared assertions.';
export const curiosityBudget = {
  proposed: 8,
  executable: 3,
  depth: 2,
  repeats: 2,
  ageSeconds: 3600,
} as const;
export interface Investigation {
  id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string;
  source_package_id: string;
  source_finding_id: string | null;
  trigger: InvestigationTrigger;
  status: InvestigationStatus;
  revision: number;
  expires_at: string;
  created_at: string;
  conclusion: InvestigationConclusion | null;
  conclusion_package_id: string | null;
  proposalCount?: number;
  executedStepCount?: number;
  latestActivity?: string;
}
export interface InvestigationProposal {
  caseId: string;
  hypothesis: string;
  rationale: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceItemIds: string[];
  dependencyId: string | null;
  bindings: SafeObservedBinding[];
}
export interface SafeObservedBinding {
  parameterPointer: string;
  evidenceItemId: string;
  field: string;
}
export interface InvestigationStep extends InvestigationProposal {
  id: string;
  investigation_id: string;
  status: ProposalStatus;
  fingerprint: string;
  approved_fingerprint: string | null;
  revision: number;
  operation_id: string;
  run_id: string | null;
  result_package_id: string | null;
  depth: number;
  approved_by?: string | null;
}
export interface CuriosityContext {
  audit?: { id: string; event: string; actor_id: string; created_at: string }[];
  investigation: Investigation;
  cases: {
    id: string;
    operation: string;
    method: string;
    graphNodes: string[];
    graphEdges: string[];
    assertions: string[];
    executable: boolean;
  }[];
  evidence: { id: string; kind: string }[];
  proposals: InvestigationStep[];
  // Existing capture intentionally erases field names and strings. Never infer IDs from field_N.
  observedValues: {
    caseId: string;
    evidenceItemId: string;
    field: string;
    value: number | string;
    parameterPointer: string;
  }[];
}
export function assertCuriosityBudget(
  context: CuriosityContext,
  caseId: string,
  dependencyId: string | null,
  now: number,
) {
  const i = context.investigation;
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(Date.parse(i.expires_at)) ||
    now >= Date.parse(i.expires_at) ||
    !['OPEN', 'WAITING_FOR_APPROVAL', 'RUNNING'].includes(i.status)
  )
    throw new ValidationError('Investigation closed or expired.');
  const parent =
    dependencyId === null
      ? undefined
      : context.proposals.find((p) => p.id === dependencyId);
  if (
    dependencyId !== null &&
    (!parent || parent.status !== 'EXECUTED' || !parent.result_package_id)
  )
    throw new ValidationError('Dependency evidence unavailable.');
  const candidate = context.cases.find((c) => c.id === caseId);
  const op = candidate?.executable ? candidate.operation : undefined;
  if (
    !op ||
    context.proposals.length >= curiosityBudget.proposed ||
    context.proposals.filter((p) => p.run_id).length >=
      curiosityBudget.executable ||
    (parent ? parent.depth + 1 : 0) > curiosityBudget.depth ||
    context.proposals.filter((p) => p.operation_id === op).length >=
      curiosityBudget.repeats
  )
    throw new ValidationError('Investigation budget exhausted.');
}
export function validateCuriosityProposal(
  raw: unknown,
  context: CuriosityContext,
  now = Date.now(),
): InvestigationProposal {
  const bad = (): never => {
    throw new ValidationError('Invalid grounded investigation proposal.');
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad();
  const v = raw as Record<string, unknown>;
  if (
    Object.keys(v).sort().join(',') !==
      'bindings,caseId,confidence,dependencyId,evidenceItemIds,hypothesis,rationale' ||
    JSON.stringify(v).length > 8000
  )
    return bad();
  validateId(v['caseId']);
  if (v['hypothesis'] !== repeatabilityHypothesis) return bad();
  for (const key of ['hypothesis', 'rationale'])
    if (
      typeof v[key] !== 'string' ||
      !(v[key] as string).trim() ||
      (v[key] as string).length > 1000 ||
      containsRecognizableCredential(v[key] as string) ||
      /(?:https?:\/\/|<script)/i.test(v[key] as string)
    )
      return bad();
  if (
    !['LOW', 'MEDIUM', 'HIGH'].includes(String(v['confidence'])) ||
    !Array.isArray(v['evidenceItemIds']) ||
    !v['evidenceItemIds'].length ||
    v['evidenceItemIds'].length > 10 ||
    new Set(v['evidenceItemIds']).size !== v['evidenceItemIds'].length ||
    v['evidenceItemIds'].some(
      (id) => !context.evidence.some((e) => e.id === id),
    )
  )
    return bad();
  if (v['dependencyId'] !== null) validateId(v['dependencyId']);
  // M1.7 has no provenance-preserving identifier extraction. Fail closed, never guess
  // from anonymized captured bodies or let a model/client provide literal values.
  if (!Array.isArray(v['bindings']) || v['bindings'].length > 1) return bad();
  for (const rawBinding of v['bindings']) {
    if (
      !rawBinding ||
      typeof rawBinding !== 'object' ||
      Array.isArray(rawBinding)
    )
      return bad();
    const b = rawBinding as Record<string, unknown>;
    if (
      Object.keys(b).sort().join(',') !==
        'evidenceItemId,field,parameterPointer' ||
      b['field'] !== 'response.status' ||
      !context.observedValues.some(
        (o) =>
          o.caseId === v['caseId'] &&
          o.evidenceItemId === b['evidenceItemId'] &&
          o.field === b['field'] &&
          o.parameterPointer === b['parameterPointer'] &&
          typeof o.value === 'number' &&
          Number.isInteger(o.value) &&
          o.value >= 100 &&
          o.value <= 599,
      ) ||
      !(v['evidenceItemIds'] as string[]).includes(String(b['evidenceItemId']))
    )
      return bad();
  }
  if (
    context.proposals.some(
      (p) =>
        proposalIdentity(p) ===
        proposalIdentity(v as unknown as InvestigationProposal),
    )
  ) {
    if (
      !['OPEN', 'WAITING_FOR_APPROVAL', 'RUNNING'].includes(
        context.investigation.status,
      ) ||
      !Number.isFinite(now) ||
      now >= Date.parse(context.investigation.expires_at)
    )
      return bad();
    return v as unknown as InvestigationProposal;
  }
  assertCuriosityBudget(
    context,
    String(v['caseId']),
    v['dependencyId'] as string | null,
    now,
  );
  return v as unknown as InvestigationProposal;
}
export function proposalIdentity(p: InvestigationProposal) {
  // Rationale/confidence are not executable inputs. Citations and dependencies are.
  return JSON.stringify([
    p.caseId,
    [...p.evidenceItemIds].sort(),
    p.dependencyId,
    p.bindings.map((b) => [b.parameterPointer, b.evidenceItemId, b.field]),
  ]);
}
export function investigationTransition(
  from: InvestigationStatus,
  to: InvestigationStatus,
) {
  const next: Record<InvestigationStatus, InvestigationStatus[]> = {
    OPEN: ['WAITING_FOR_APPROVAL', 'RUNNING', 'STOPPED', 'CONCLUDED'],
    WAITING_FOR_APPROVAL: ['OPEN', 'RUNNING', 'STOPPED', 'CONCLUDED'],
    RUNNING: ['WAITING_FOR_APPROVAL', 'OPEN', 'STOPPED', 'CONCLUDED'],
    CONCLUDED: [],
    STOPPED: [],
  };
  return next[from].includes(to);
}
export function proposalTransition(from: ProposalStatus, to: ProposalStatus) {
  const next: Record<ProposalStatus, ProposalStatus[]> = {
    PROPOSED: ['APPROVED', 'REJECTED'],
    APPROVED: ['MATERIALIZED'],
    MATERIALIZED: ['EXECUTED', 'BLOCKED'],
    EXECUTED: [],
    REJECTED: [],
    BLOCKED: [],
  };
  return next[from].includes(to);
}
export function conclusionFromResults(
  outcomes: string[],
  budgetExhausted = false,
): InvestigationConclusion {
  if (!outcomes.length)
    throw new ValidationError('Resulting evidence required.');
  if (outcomes.every((o) => o === 'PASSED')) return 'HYPOTHESIS_SUPPORTED';
  if (outcomes.some((o) => o === 'FAILED')) return 'HYPOTHESIS_NOT_SUPPORTED';
  if (outcomes.every((o) => ['BLOCKED', 'CANCELLED'].includes(o)))
    return 'STOPPED_BY_POLICY';
  if (
    budgetExhausted &&
    outcomes.every((o) => ['PASSED', 'BLOCKED', 'CANCELLED'].includes(o))
  )
    return 'BUDGET_EXHAUSTED';
  return 'INCONCLUSIVE';
}
