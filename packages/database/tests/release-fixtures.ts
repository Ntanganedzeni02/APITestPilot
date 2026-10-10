// Deliberate test snapshots only; no hosted/network interactions.
import {
  assessQuality,
  assessRelease,
  type Release,
  type ReleaseAssessment,
  type ReleaseDecision,
  type ReleaseReport,
} from '@testpilot/domain';
export const id = '14000000-0000-0000-0000-000000000001';
export const other = '14000000-0000-0000-0000-000000000002';
export function releaseFixture(): Release {
  return {
    id,
    workspace_id: id,
    project_id: id,
    environment_id: id,
    api_import_id: id,
    name: 'Release fixture',
    created_at: '2026-10-07T00:00:00Z',
    created_by: id,
    assessment_id: id,
    decision_id: null,
    decision_revision: 0,
  };
}
export function assessmentFixture(): ReleaseAssessment {
  const result = assessQuality({
    sourceId: id,
    analysisId: id,
    knownOperations: 10,
    testedOperations: 10,
    activeRequirements: 10,
    coveredRequirements: 10,
    riskWeight: 20,
    coveredRiskWeight: 20,
    executionPoints: 1000,
    findingPenalty: 0,
    freshnessPoints: 1000,
    gaps: { requirements: [], risks: [], operations: [] },
    provenance: {
      runIds: [],
      packageIds: [],
      findingIds: [],
      reviewIds: [],
      stateHash: 'a'.repeat(64),
    },
  });
  const quality = {
    id,
    workspace_id: id,
    project_id: id,
    environment_id: id,
    api_import_id: id,
    fingerprint: 'a'.repeat(64),
    scoring_version: 'api-quality-v1',
    created_by: id,
    assessed_at: '2026-10-07T00:00:00Z',
    result,
  };
  return {
    id,
    release_id: id,
    workspace_id: id,
    project_id: id,
    environment_id: id,
    api_import_id: id,
    quality_assessment_id: id,
    policy_version: 'release-policy-v1',
    fingerprint: 'a'.repeat(64),
    assessed_at: '2026-10-07T00:00:00Z',
    created_by: id,
    result: assessRelease({
      sourceCurrent: true,
      quality,
      findings: [],
      coverage: [],
      runs: [],
      investigations: [],
      memory: [],
    }),
  };
}
export function decisionFixture(): ReleaseDecision {
  return {
    id,
    release_id: id,
    assessment_id: id,
    workspace_id: id,
    project_id: id,
    environment_id: id,
    api_import_id: id,
    revision: 1,
    decision: 'APPROVE',
    rationale: 'Reviewed evidence.',
    is_override: false,
    actor_id: id,
    decided_at: '2026-10-07T00:00:00Z',
  };
}
export function reportFixture(): ReleaseReport {
  return {
    id,
    release_id: id,
    assessment_id: id,
    decision_id: null,
    workspace_id: id,
    project_id: id,
    environment_id: id,
    api_import_id: id,
    report_version: 'release-report-v1',
    fingerprint: 'b'.repeat(64),
    generated_at: '2026-10-07T00:00:00Z',
    generated_by: id,
    snapshot: {
      reportVersion: 'release-report-v1',
      release: releaseFixture(),
      environmentType: 'DEVELOPMENT',
      assessment: assessmentFixture(),
      decision: null,
    },
  };
}
