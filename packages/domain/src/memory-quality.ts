import { ValidationError } from './index.js';
import { containsRecognizableCredential } from './credentials.js';
import { assertSafeLiteralPath } from './execution.js';

/** Reject unsafe persisted display identifiers; null preserves scoped provenance. */
export function assertMemoryOperation(value: string | null): void {
  if (value === null) return;
  try {
    if (typeof value !== 'string' || value.length > 2048) throw Error();
    assertSafeLiteralPath(value);
    const decoded = decodeURIComponent(
      (value.startsWith('[') ? JSON.parse(value)[1] : value).replaceAll(
        '~1',
        '/',
      ),
    );
    if (typeof decoded !== 'string' || containsRecognizableCredential(decoded))
      throw Error();
  } catch {
    throw new ValidationError('Unsafe memory operation identifier.');
  }
}

export const memoryKinds = [
  'OPERATION_VERIFIED_SUCCESS',
  'ASSERTION_FAILURE_OBSERVED',
  'EXECUTION_ERROR_OBSERVED',
  'BEHAVIOR_OBSERVED',
  'FINDING_CONFIRMED',
  'FINDING_DISMISSED',
  'FINDING_REOBSERVED',
  'INVESTIGATION_CONCLUDED',
] as const;
export type MemoryKind = (typeof memoryKinds)[number];
export const memoryCurrentness = [
  'CURRENT',
  'HISTORICAL',
  'SUPERSEDED',
] as const;
export interface MemoryFact {
  id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string;
  api_import_id: string;
  graph_id: string;
  case_id: string;
  operation_id: string | null;
  kind: MemoryKind;
  fingerprint: string;
  finding_id: string | null;
  first_observed_at: string;
  last_observed_at: string;
  observation_count: number;
  currentness: (typeof memoryCurrentness)[number];
}
export interface MemoryObservation {
  id: string;
  fact_id: string;
  run_id: string;
  package_id: string;
  evidence_item_id: string | null;
  finding_id: string | null;
  review_id: string | null;
  investigation_id: string | null;
  claim: string;
  observed_at: string;
}
export const qualityWeights = {
  requirements: 25,
  risks: 25,
  execution: 25,
  findings: 15,
  freshness: 10,
} as const;
export const scoringVersion = 'api-quality-v1';
export const freshnessBands = { recentDays: 7, agingDays: 30 } as const;
export const riskWeights = { LOW: 1, MEDIUM: 2, HIGH: 4, CRITICAL: 8 } as const;
export const findingPenalties = {
  INFO: 0,
  LOW: 10,
  MEDIUM: 30,
  HIGH: 60,
  CRITICAL: 100,
} as const;
export interface QualityInputs {
  sourceId: string | null;
  analysisId: string | null;
  knownOperations: number;
  testedOperations: number;
  activeRequirements: number;
  coveredRequirements: number;
  riskWeight: number;
  coveredRiskWeight: number;
  executionPoints: number;
  findingPenalty: number;
  freshnessPoints: number;
  gaps: { requirements: string[]; risks: string[]; operations: string[] };
  provenance: {
    runIds: string[];
    packageIds: string[];
    findingIds: string[];
    reviewIds: string[];
    stateHash: string;
  };
}
export interface QualityDimension {
  score: number | null;
  numerator: number;
  denominator: number;
  weight: number;
  basis: string;
}
export interface QualityResult {
  scoringVersion: typeof scoringVersion;
  overall: number | null;
  sufficiency: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'UNKNOWN' | 'WEAK' | 'MODERATE' | 'STRONG';
  dimensions: Record<keyof typeof qualityWeights, QualityDimension>;
  inputs: QualityInputs;
}
export interface QualityAssessment {
  id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string;
  api_import_id: string | null;
  fingerprint: string;
  scoring_version: string;
  assessed_at: string;
  result: QualityResult;
  created_by: string;
}
export function freshnessPoints(ageDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays < 0)
    throw new ValidationError('Invalid evidence age.');
  return ageDays <= freshnessBands.recentDays
    ? 100
    : ageDays <= freshnessBands.agingDays
      ? 50
      : 0;
}
// Positive rational half-up rounding matches PostgreSQL numeric without float tie drift.
function roundedRatio(n: bigint, d: bigint): number {
  return Number((2n * n + d) / (2n * d));
}
function roundedSum(terms: readonly (readonly [number, number])[]): number {
  let n = 0n,
    d = 1n;
  for (const [numerator, denominator] of terms)
    if (denominator > 0) {
      const next = BigInt(denominator);
      n = n * next + BigInt(numerator) * d;
      d *= next;
    }
  return roundedRatio(n, d);
}
export function assessQuality(input: QualityInputs): QualityResult {
  for (const key of [
    'knownOperations',
    'testedOperations',
    'activeRequirements',
    'coveredRequirements',
    'riskWeight',
    'coveredRiskWeight',
    'executionPoints',
    'findingPenalty',
    'freshnessPoints',
  ] as const) {
    const value = input[key];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 500000 ||
      (key !== 'findingPenalty' && !Number.isSafeInteger(value)) ||
      (key === 'findingPenalty' && !Number.isSafeInteger(value * 2))
    )
      throw new ValidationError('Invalid quality inputs.');
  }
  if (
    input.testedOperations > input.knownOperations ||
    input.coveredRequirements > input.activeRequirements ||
    input.coveredRiskWeight > input.riskWeight ||
    input.executionPoints > 100 * input.knownOperations ||
    input.freshnessPoints > 100 * input.knownOperations ||
    input.findingPenalty > 100 * input.knownOperations
  )
    throw new ValidationError('Inconsistent quality inputs.');
  const dimension = (
    n: number,
    d: number,
    weight: number,
    basis: string,
  ): QualityDimension => ({
    score: d ? roundedRatio(BigInt(200 * n), BigInt(2 * d)) : null,
    numerator: n,
    denominator: d,
    weight,
    basis,
  });
  const dimensions = {
    requirements: dimension(
      input.coveredRequirements,
      input.activeRequirements,
      qualityWeights.requirements,
      'Active requirements with reviewed-version-matching asserted evidence within 30 UTC days.',
    ),
    risks: dimension(
      input.coveredRiskWeight,
      input.riskWeight,
      qualityWeights.risks,
      'Severity-weighted active risks with asserted evidence within 30 UTC days.',
    ),
    execution: dimension(
      input.executionPoints,
      100 * input.knownOperations,
      qualityWeights.execution,
      'Latest 30-day assertion health per operation; infrastructure errors earn zero health points, not defect confirmation. Untested operations earn no points.',
    ),
    findings: dimension(
      input.testedOperations
        ? 100 * input.knownOperations - input.findingPenalty
        : 0,
      input.testedOperations ? 100 * input.knownOperations : 0,
      qualityWeights.findings,
      'Maximum unresolved finding penalty per known operation; unreviewed/stale findings remain active: confirmed severity penalty, candidate quarter penalty, dismissed zero.',
    ),
    freshness: dimension(
      input.freshnessPoints,
      100 * input.knownOperations,
      qualityWeights.freshness,
      'Latest asserted observation per operation: 100 points through day 7, 50 through day 30, otherwise zero.',
    ),
  };
  const overall =
    input.testedOperations && input.knownOperations
      ? Math.round(
          Object.values(dimensions).reduce(
            (s, d) => s + (d.score ?? 0) * d.weight,
            0,
          ) / 100,
        )
      : null;
  const sufficiency = roundedSum([
    [40 * input.testedOperations, input.knownOperations],
    [20 * input.coveredRequirements, input.activeRequirements],
    [20 * input.coveredRiskWeight, input.riskWeight],
    [20 * input.freshnessPoints, 100 * input.knownOperations],
  ]);
  return {
    scoringVersion,
    overall,
    sufficiency,
    confidence:
      input.testedOperations >= 5 && sufficiency >= 80
        ? 'HIGH'
        : input.testedOperations >= 3 && sufficiency >= 40
          ? 'MEDIUM'
          : 'LOW',
    status:
      overall === null
        ? 'UNKNOWN'
        : overall >= 80
          ? 'STRONG'
          : overall >= 50
            ? 'MODERATE'
            : 'WEAK',
    dimensions,
    inputs: input,
  };
}
export function qualityTrend(
  current: QualityAssessment,
  previous: QualityAssessment | null,
) {
  const comparable =
    !!previous &&
    current.workspace_id === previous.workspace_id &&
    current.project_id === previous.project_id &&
    current.environment_id === previous.environment_id &&
    current.api_import_id === previous.api_import_id &&
    current.scoring_version === previous.scoring_version;
  const delta = (a: number | null, b: number | null) =>
    a === null || b === null ? null : a - b;
  return {
    comparable,
    reason: !previous
      ? 'FIRST_ASSESSMENT'
      : !comparable
        ? 'SCOPE_OR_VERSION_CHANGED'
        : 'COMPARABLE',
    overall: comparable
      ? delta(current.result.overall, previous.result.overall)
      : null,
    sufficiency: comparable
      ? current.result.sufficiency - previous.result.sufficiency
      : null,
    dimensions: Object.fromEntries(
      Object.keys(qualityWeights).map((k) => [
        k,
        comparable
          ? delta(
              current.result.dimensions[k as keyof typeof qualityWeights].score,
              previous.result.dimensions[k as keyof typeof qualityWeights]
                .score,
            )
          : null,
      ]),
    ),
  };
}
export interface MemoryQualityQuery {
  listFacts(
    workspace: string,
    project: string,
    environment: string,
    filters?: {
      page?: number;
      kind?: string;
      currentness?: string;
      operation?: string;
    },
  ): Promise<MemoryFact[]>;
  current(
    workspace: string,
    project: string,
    environment: string,
  ): Promise<{
    current: QualityAssessment | null;
    previous: QualityAssessment | null;
  }>;
  history(
    workspace: string,
    project: string,
    environment: string,
    page?: number,
  ): Promise<QualityAssessment[]>;
}

/** Bounded provider-neutral retrieval for future Ask. No interpretation or write authority. */
export function createIntelligenceQueries(query: MemoryQualityQuery) {
  return {
    operationHistory: (
      workspace: string,
      project: string,
      environment: string,
      operation: string,
      page = 0,
    ) => query.listFacts(workspace, project, environment, { operation, page }),
    findingHistory: (
      workspace: string,
      project: string,
      environment: string,
      dismissed = false,
      page = 0,
    ) =>
      query.listFacts(workspace, project, environment, {
        kind: dismissed ? 'FINDING_DISMISSED' : 'FINDING_CONFIRMED',
        page,
      }),
    investigationHistory: (
      workspace: string,
      project: string,
      environment: string,
      page = 0,
    ) =>
      query.listFacts(workspace, project, environment, {
        kind: 'INVESTIGATION_CONCLUDED',
        page,
      }),
    async recurringFailures(
      workspace: string,
      project: string,
      environment: string,
      page = 0,
    ) {
      return (
        await query.listFacts(workspace, project, environment, {
          kind: 'ASSERTION_FAILURE_OBSERVED',
          page,
        })
      ).filter((f) => f.observation_count > 1);
    },
    async qualityGaps(workspace: string, project: string, environment: string) {
      return (
        (await query.current(workspace, project, environment)).current?.result
          .inputs.gaps ?? null
      );
    },
    currentAssessment: (
      workspace: string,
      project: string,
      environment: string,
    ) => query.current(workspace, project, environment),
  };
}
