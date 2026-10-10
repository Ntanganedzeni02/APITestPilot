import { containsRecognizableCredential } from './credentials.js';
import type { ExecutionResult } from './execution.js';
import { ValidationError, validateId } from './index.js';
export const findingSeverities = [
  'INFO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;
export const findingStatuses = ['CANDIDATE', 'CONFIRMED', 'DISMISSED'] as const;
export const findingConfidences = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type FindingSeverity = (typeof findingSeverities)[number];
export type FindingStatus = (typeof findingStatuses)[number];
export type FindingConfidence = (typeof findingConfidences)[number];
export type FindingSource = 'DETERMINISTIC';
export type FindingRule =
  'ASSERTION_FAILED' | 'EXECUTION_TIMEOUT' | 'TRANSPORT_FAILURE';
export const evidenceKinds = [
  'REQUEST_SUMMARY',
  'RESPONSE_SUMMARY',
  'ASSERTION_RESULT',
  'TIMING',
  'EXECUTION_FAILURE',
  'SAFETY_DECISION',
] as const;
export interface EvidenceItem {
  id: string;
  package_id: string;
  kind: (typeof evidenceKinds)[number];
  assertion_index: number | null;
}
export interface EvidencePackage {
  id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string;
  run_id: string;
  plan_id: string;
  case_id: string;
  scenario_id: string;
  config_id: string;
  fingerprint: string;
  created_at: string;
  version: '1';
}
export interface Finding {
  id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string;
  case_id: string;
  first_package_id: string;
  fingerprint: string;
  rule: FindingRule;
  assertion_key: string;
  title: string;
  summary: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  status: FindingStatus;
  source: FindingSource;
  revision: number;
  occurrence_count: number;
  first_observed_at: string;
  last_observed_at: string;
  operation?: { method: string; pointer: string };
}
export interface FindingOccurrence {
  id: string;
  finding_id: string;
  package_id: string;
  assertion_index: number | null;
  observed_at: string;
}
export interface FindingReview {
  id: string;
  finding_id: string;
  actor_id: string;
  revision: number;
  decision: 'CONFIRM' | 'DISMISS';
  previous_status: FindingStatus;
  new_status: FindingStatus;
  previous_severity: FindingSeverity;
  new_severity: FindingSeverity;
  note: string;
  created_at: string;
}
export interface FindingClassification {
  rule: FindingRule;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  assertionIndex: number | null;
}
export function classifyExecution(
  result: ExecutionResult,
): FindingClassification[] {
  if (result.outcome === 'FAILED' && result.sent && result.response)
    return result.assertions.flatMap((a, i) =>
      a.status === 'FAIL'
        ? [
            {
              rule: 'ASSERTION_FAILED' as const,
              severity: 'MEDIUM' as const,
              confidence: 'HIGH' as const,
              assertionIndex: i,
            },
          ]
        : [],
    );
  if (result.outcome !== 'ERROR') return [];
  if (result.failure === 'TIMEOUT' || result.failure === 'CONNECTION_TIMEOUT')
    return [
      {
        rule: 'EXECUTION_TIMEOUT',
        severity: 'INFO',
        confidence: 'MEDIUM',
        assertionIndex: null,
      },
    ];
  if (result.failure === 'TRANSPORT_FAILURE')
    return [
      {
        rule: 'TRANSPORT_FAILURE',
        severity: 'INFO',
        confidence: 'LOW',
        assertionIndex: null,
      },
    ];
  return [];
}
export function reviewTransition(
  status: FindingStatus,
  decision: 'CONFIRM' | 'DISMISS',
): FindingStatus {
  if (status !== 'CANDIDATE' || !['CONFIRM', 'DISMISS'].includes(decision))
    throw new ValidationError(
      'This finding is already reviewed or the decision is invalid.',
    );
  return decision === 'CONFIRM' ? 'CONFIRMED' : 'DISMISSED';
}
export interface FindingInterpretationProposal {
  evidenceItemIds: string[];
  title: string;
  summary: string;
  proposedSeverity: FindingSeverity;
  proposedConfidence: FindingConfidence;
}
export interface FindingInterpretationProvider {
  interpret(
    input: { evidence: Pick<EvidenceItem, 'id' | 'kind'>[] },
    signal: { readonly aborted: boolean },
  ): Promise<unknown>;
}
export function validateInterpretation(
  value: unknown,
  evidence: EvidenceItem[],
): FindingInterpretationProposal {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ValidationError('Invalid interpretation.');
  const v = value as Record<string, unknown>;
  const keys = [
    'evidenceItemIds',
    'title',
    'summary',
    'proposedSeverity',
    'proposedConfidence',
  ];
  if (
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !(k in v)) ||
    !Array.isArray(v['evidenceItemIds']) ||
    !v['evidenceItemIds'].length ||
    v['evidenceItemIds'].length > 30 ||
    v['evidenceItemIds'].some(
      (id) => typeof id !== 'string' || !evidence.some((e) => e.id === id),
    ) ||
    new Set(v['evidenceItemIds']).size !== v['evidenceItemIds'].length ||
    typeof v['title'] !== 'string' ||
    !v['title'].trim() ||
    v['title'].length > 160 ||
    typeof v['summary'] !== 'string' ||
    !v['summary'].trim() ||
    v['summary'].length > 2000 ||
    !(findingSeverities as readonly unknown[]).includes(
      v['proposedSeverity'],
    ) ||
    !(findingConfidences as readonly unknown[]).includes(
      v['proposedConfidence'],
    )
  )
    throw new ValidationError(
      'Invalid interpretation or unsupported evidence reference.',
    );
  return value as FindingInterpretationProposal;
}
export function validateFindingReview(
  id: string,
  revision: number,
  decision: string,
  severity: string,
  note: string,
) {
  validateId(id);
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !['CONFIRM', 'DISMISS'].includes(decision) ||
    !(findingSeverities as readonly string[]).includes(severity) ||
    note.length > 1000 ||
    containsRecognizableCredential(note)
  )
    throw new ValidationError(
      'Invalid review. Do not include credentials in review notes.',
    );
}
