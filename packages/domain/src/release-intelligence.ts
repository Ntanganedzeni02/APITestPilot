import { ValidationError, validateId, type WorkspaceRole } from './index.js';
import { type QualityAssessment } from './memory-quality.js';
import { containsRecognizableCredential } from './credentials.js';

export const releasePolicyVersion = 'release-policy-v1' as const;
export const releaseReportVersion = 'release-report-v1' as const;
export const releaseStatuses = [
  'CLEAR',
  'CAUTION',
  'BLOCKED',
  'INSUFFICIENT_EVIDENCE',
] as const;
export type ReleaseStatus = (typeof releaseStatuses)[number];
export const releaseDecisions = [
  'APPROVE',
  'APPROVE_WITH_RISK',
  'REJECT',
] as const;
export type ReleaseDecisionValue = (typeof releaseDecisions)[number];
export const releaseMinimumSufficiency = 80;
export interface ReleaseFinding {
  id: string;
  status: 'CANDIDATE' | 'CONFIRMED' | 'DISMISSED';
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  revision: number;
  caseId: string;
  packageId: string;
  occurrences: number;
  reviewIds: string[];
}
export interface ReleaseCoverage {
  id: string;
  kind: 'REQUIREMENT' | 'RISK';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  covered: boolean;
  failedRunIds: string[];
  reviewId: string | null;
}
export interface ReleaseRun {
  operationHash: string;
  runId: string;
  packageId: string;
  outcome: 'PASS' | 'FAIL' | 'ERROR' | 'UNKNOWN';
  ageBand: 'RECENT' | 'AGING' | 'STALE';
  asserted: boolean;
}
export interface ReleaseInvestigation {
  conclusionPackageId?: string | null;
  auditIds?: string[];
  id: string;
  status: 'OPEN' | 'WAITING_FOR_APPROVAL' | 'RUNNING' | 'CONCLUDED' | 'STOPPED';
  conclusion:
    | 'HYPOTHESIS_SUPPORTED'
    | 'HYPOTHESIS_NOT_SUPPORTED'
    | 'INCONCLUSIVE'
    | 'STOPPED_BY_POLICY'
    | 'BUDGET_EXHAUSTED'
    | null;
  revision: number;
  packageId: string;
}
export interface ReleaseMemory {
  observationIds?: string[];
  runIds?: string[];
  packageIds?: string[];
  id: string;
  kind: string;
  currentness: 'CURRENT' | 'HISTORICAL' | 'SUPERSEDED';
  count: number;
  caseId: string;
  packageId: string;
}
export interface ReleaseInputs {
  sourceCurrent: boolean;
  quality: QualityAssessment | null;
  findings: ReleaseFinding[];
  coverage: ReleaseCoverage[];
  runs: ReleaseRun[];
  investigations: ReleaseInvestigation[];
  memory: ReleaseMemory[];
}
export interface ReleaseSignal {
  code: string;
  ids: string[];
}
export interface ReleaseResult {
  policyVersion: typeof releasePolicyVersion;
  status: ReleaseStatus;
  blockers: ReleaseSignal[];
  warnings: ReleaseSignal[];
  unknowns: ReleaseSignal[];
  inputs: ReleaseInputs;
}
export interface Release {
  id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string;
  api_import_id: string;
  name: string;
  created_at: string;
  created_by: string;
  assessment_id: string | null;
  decision_id: string | null;
  decision_revision: number;
}
export interface ReleaseAssessment {
  id: string;
  release_id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string;
  api_import_id: string;
  quality_assessment_id: string | null;
  policy_version: typeof releasePolicyVersion;
  fingerprint: string;
  result: ReleaseResult;
  assessed_at: string;
  created_by: string;
}
export interface ReleaseDecision {
  id: string;
  release_id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string;
  api_import_id: string;
  assessment_id: string;
  revision: number;
  decision: ReleaseDecisionValue;
  rationale: string;
  is_override: boolean;
  actor_id: string;
  decided_at: string;
}
export interface ReleaseReport {
  id: string;
  release_id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string;
  api_import_id: string;
  assessment_id: string;
  decision_id: string | null;
  report_version: typeof releaseReportVersion;
  fingerprint: string;
  generated_at: string;
  generated_by: string;
  snapshot: {
    reportVersion: typeof releaseReportVersion;
    release: Pick<
      Release,
      | 'id'
      | 'name'
      | 'workspace_id'
      | 'project_id'
      | 'environment_id'
      | 'api_import_id'
    >;
    environmentType: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
    assessment: ReleaseAssessment;
    decision: ReleaseDecision | null;
  };
}
export function validateReleaseText(
  value: unknown,
  max: number,
  required = true,
): string {
  if (typeof value !== 'string')
    throw new ValidationError('Enter safe bounded text.');
  const text = value.trim();
  if (
    text.length > max ||
    (required && !text) ||
    Array.from(text).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    containsRecognizableCredential(text)
  )
    throw new ValidationError('Use bounded text without credentials.');
  let decoded = text;
  while (/%[0-9a-f]{2}/i.test(decoded))
    decoded = decoded.replace(/%([0-9a-f]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  if (
    Array.from(decoded).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    containsRecognizableCredential(decoded)
  )
    throw new ValidationError('Use bounded text without credentials.');
  return text;
}
export function canManageReleases(role: WorkspaceRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
export function releaseLifecycle(
  release: Release,
  decision: ReleaseDecision | null,
): 'DRAFT' | 'ASSESSED' | 'DECIDED' {
  return !release.assessment_id
    ? 'DRAFT'
    : decision?.assessment_id === release.assessment_id
      ? 'DECIDED'
      : 'ASSESSED';
}
/** Describes evidence only; never returns execution or release authorization. */
export function assessRelease(input: ReleaseInputs): ReleaseResult {
  const blockers: ReleaseSignal[] = [],
    warnings: ReleaseSignal[] = [],
    unknowns: ReleaseSignal[] = [];
  const add = (target: ReleaseSignal[], code: string, ids: string[] = []) =>
    target.push({ code, ids });
  if (typeof input.sourceCurrent !== 'boolean')
    throw new ValidationError('Invalid release scope.');
  for (const list of [
    input.findings,
    input.coverage,
    input.runs,
    input.investigations,
    input.memory,
  ])
    if (!Array.isArray(list) || list.length > 10000)
      throw new ValidationError('Release input capacity exceeded.');
  for (const f of input.findings) {
    validateId(f.id);
    if (
      !['CANDIDATE', 'CONFIRMED', 'DISMISSED'].includes(f.status) ||
      !['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(f.severity)
    )
      throw new ValidationError('Invalid finding state.');
    if (f.status === 'CONFIRMED' && ['HIGH', 'CRITICAL'].includes(f.severity))
      add(blockers, 'CONFIRMED_BLOCKING_FINDING', [f.id]);
    else if (f.status === 'CONFIRMED' && f.severity === 'MEDIUM')
      add(warnings, 'CONFIRMED_MEDIUM_FINDING', [f.id]);
    else if (
      f.status === 'CANDIDATE' &&
      ['HIGH', 'CRITICAL'].includes(f.severity)
    )
      add(warnings, 'CANDIDATE_SEVERE_FINDING', [f.id]);
  }
  for (const c of input.coverage) {
    validateId(c.id);
    c.failedRunIds.forEach(validateId);
    if (
      !['REQUIREMENT', 'RISK'].includes(c.kind) ||
      typeof c.covered !== 'boolean' ||
      (c.kind === 'RISK' &&
        !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(c.severity ?? ''))
    )
      throw new ValidationError('Invalid coverage.');
    if (!c.covered)
      add(
        unknowns,
        c.kind === 'RISK' && ['HIGH', 'CRITICAL'].includes(c.severity ?? '')
          ? 'UNCOVERED_HIGH_RISK'
          : `UNCOVERED_${c.kind}`,
        [c.id],
      );
    if (c.failedRunIds.length)
      add(
        c.kind === 'RISK' && ['HIGH', 'CRITICAL'].includes(c.severity ?? '')
          ? blockers
          : warnings,
        c.kind === 'RISK' && ['HIGH', 'CRITICAL'].includes(c.severity ?? '')
          ? 'FAILED_HIGH_RISK'
          : `FAILED_${c.kind}`,
        [c.id, ...c.failedRunIds],
      );
  }
  for (const r of input.runs) {
    validateId(r.runId);
    validateId(r.packageId);
    if (
      !/^[a-f0-9]{64}$/.test(r.operationHash) ||
      !['PASS', 'FAIL', 'ERROR', 'UNKNOWN'].includes(r.outcome) ||
      !['RECENT', 'AGING', 'STALE'].includes(r.ageBand)
    )
      throw new ValidationError('Invalid execution summary.');
    if (r.outcome === 'UNKNOWN')
      add(unknowns, 'UNASSERTED_OPERATION', [r.runId]);
    if (r.ageBand === 'STALE') add(unknowns, 'STALE_EVIDENCE', [r.runId]);
    else {
      if (r.outcome === 'FAIL') add(warnings, 'FAILED_EXECUTION', [r.runId]);
      if (r.outcome === 'ERROR')
        add(warnings, 'INFRASTRUCTURE_ERROR', [r.runId]);
      if (r.asserted && r.ageBand === 'AGING')
        add(warnings, 'AGING_EVIDENCE', [r.runId]);
    }
  }
  for (const i of input.investigations) {
    validateId(i.id);
    if (
      ![
        'OPEN',
        'WAITING_FOR_APPROVAL',
        'RUNNING',
        'CONCLUDED',
        'STOPPED',
      ].includes(i.status)
    )
      throw new ValidationError('Invalid investigation.');
    if (!['CONCLUDED', 'STOPPED'].includes(i.status))
      add(unknowns, 'OPEN_INVESTIGATION', [i.id]);
    else if (
      ['INCONCLUSIVE', 'STOPPED_BY_POLICY', 'BUDGET_EXHAUSTED'].includes(
        i.conclusion ?? '',
      )
    )
      add(warnings, 'INCONCLUSIVE_INVESTIGATION', [i.id]);
  }
  for (const m of input.memory) {
    validateId(m.id);
    if (
      m.currentness === 'CURRENT' &&
      m.count > 1 &&
      m.kind === 'ASSERTION_FAILURE_OBSERVED'
    )
      add(warnings, 'RECURRING_CURRENT_FAILURE', [m.id]);
  }
  if (!input.sourceCurrent) add(unknowns, 'SOURCE_SUPERSEDED');
  const q = input.quality;
  if (!q) add(unknowns, 'NO_CURRENT_QUALITY');
  else {
    if (q.scoring_version !== 'api-quality-v1')
      throw new ValidationError('Unsupported quality version.');
    if (
      q.result.overall === null ||
      q.result.sufficiency < releaseMinimumSufficiency ||
      q.result.confidence === 'LOW'
    )
      add(unknowns, 'INSUFFICIENT_QUALITY_EVIDENCE', [q.id]);
    for (const id of q.result.inputs.gaps.operations)
      add(unknowns, 'UNTESTED_OPERATION', [id]);
    for (const key of Object.keys(
      q.result.dimensions,
    ).sort() as (keyof typeof q.result.dimensions)[])
      if (
        q.result.dimensions[key].score !== null &&
        q.result.dimensions[key].score! < 80
      )
        add(warnings, 'QUALITY_' + key.toUpperCase() + '_BELOW_80', [q.id]);
  }
  const status: ReleaseStatus = blockers.length
    ? 'BLOCKED'
    : unknowns.length
      ? 'INSUFFICIENT_EVIDENCE'
      : warnings.length
        ? 'CAUTION'
        : 'CLEAR';
  return {
    policyVersion: releasePolicyVersion,
    status,
    blockers,
    warnings,
    unknowns,
    inputs: input,
  };
}
export interface ReleaseQuery {
  list(workspace: string, project: string, page?: number): Promise<Release[]>;
  report(
    workspace: string,
    project: string,
    id: string,
  ): Promise<ReleaseReport | null>;
  reports(
    workspace: string,
    project: string,
    page?: number,
  ): Promise<ReleaseReport[]>;
}
