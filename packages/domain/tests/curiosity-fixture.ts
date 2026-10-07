import {
  repeatabilityHypothesis,
  type CuriosityContext,
  type InvestigationProposal,
} from '../src/curiosity.js';
export const id = '14000000-0000-0000-0000-000000000001';
export const now = Date.parse('2026-10-07T12:00:00Z');
export function fixture(): CuriosityContext {
  return {
    investigation: {
      id,
      workspace_id: id,
      project_id: id,
      environment_id: id,
      source_package_id: id,
      source_finding_id: null,
      trigger: 'FAILED_ASSERTION',
      status: 'OPEN',
      revision: 0,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 3600000).toISOString(),
      conclusion: null,
      conclusion_package_id: null,
    },
    cases: [
      {
        id,
        operation: '["OPERATION","GET /fixture"]',
        method: 'GET',
        graphNodes: ['fixture-node'],
        graphEdges: [],
        assertions: ['DECLARED_CONTRACT'],
        executable: true,
      },
    ],
    evidence: [{ id, kind: 'ASSERTION_RESULT' }],
    proposals: [],
    observedValues: [],
  };
}
export function proposal(): InvestigationProposal {
  return {
    caseId: id,
    hypothesis: repeatabilityHypothesis,
    rationale: 'Compare a bounded follow-up with evidence.',
    confidence: 'LOW',
    evidenceItemIds: [id],
    dependencyId: null,
    bindings: [],
  };
}
