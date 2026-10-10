import { describe, it, expect } from 'vitest';
import {
  assessRelease,
  assessQuality,
  canManageReleases,
  releaseLifecycle,
  validateReleaseText,
  type ReleaseInputs,
  type Release,
  type ReleaseDecision,
} from '../src/index.js';
const id = '14000000-0000-0000-0000-000000000001';
function input(): ReleaseInputs {
  return {
    sourceCurrent: true,
    quality: {
      id,
      workspace_id: id,
      project_id: id,
      environment_id: id,
      api_import_id: id,
      created_by: id,
      fingerprint: 'a'.repeat(64),
      assessed_at: '2026-10-07T00:00:00Z',
      scoring_version: 'api-quality-v1',
      result: assessQuality({
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
      }),
    },
    findings: [],
    coverage: [],
    runs: [],
    investigations: [],
    memory: [],
  };
}
const finding = (
  status: 'CONFIRMED' | 'CANDIDATE' | 'DISMISSED',
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
) => ({
  id,
  status,
  severity,
  revision: 1,
  caseId: id,
  packageId: id,
  occurrences: 1,
  reviewIds: [id],
});
describe('release-policy-v1 evidence semantics', () => {
  it('adequate current evidence is CLEAR, never approval', () => {
    expect(assessRelease(input()).status).toBe('CLEAR');
    expect(assessRelease(input())).not.toHaveProperty('decision');
  });
  for (const severity of ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const)
    for (const status of ['CONFIRMED', 'CANDIDATE', 'DISMISSED'] as const)
      it(`${status} ${severity} finding classification`, () => {
        const i = input();
        i.findings = [finding(status, severity)];
        const r = assessRelease(i);
        expect(r.status).toBe(
          status === 'CONFIRMED' && ['HIGH', 'CRITICAL'].includes(severity)
            ? 'BLOCKED'
            : (status === 'CONFIRMED' && severity === 'MEDIUM') ||
                (status === 'CANDIDATE' &&
                  ['HIGH', 'CRITICAL'].includes(severity))
              ? 'CAUTION'
              : 'CLEAR',
        );
      });
  it.each([1, 2, 100])('occurrences %i never multiply blockers', (count) => {
    const i = input();
    i.findings = [{ ...finding('CONFIRMED', 'CRITICAL'), occurrences: count }];
    expect(assessRelease(i).blockers).toHaveLength(1);
  });
  it('BLOCKED precedes insufficiency and warnings', () => {
    const i = input();
    i.quality = null;
    i.findings = [finding('CONFIRMED', 'HIGH'), finding('CANDIDATE', 'HIGH')];
    expect(assessRelease(i).status).toBe('BLOCKED');
    expect(assessRelease(i).unknowns).not.toHaveLength(0);
  });
  it('insufficiency precedes caution', () => {
    const i = input();
    i.quality = null;
    i.findings = [finding('CANDIDATE', 'CRITICAL')];
    expect(assessRelease(i).status).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('old source is insufficient despite high historical quality', () => {
    const i = input();
    i.sourceCurrent = false;
    expect(assessRelease(i).status).toBe('INSUFFICIENT_EVIDENCE');
  });
  it.each([0, 1, 39, 40, 79, 80, 100])('sufficiency threshold %i', (s) => {
    const i = input();
    i.quality!.result.sufficiency = s;
    expect(assessRelease(i).status).toBe(
      s < 80 ? 'INSUFFICIENT_EVIDENCE' : 'CLEAR',
    );
  });
  it('high score with LOW confidence is insufficient', () => {
    const i = input();
    i.quality!.result.confidence = 'LOW';
    expect(assessRelease(i).status).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('never-tested quality is not pass', () => {
    const i = input();
    i.quality!.result.overall = null;
    expect(assessRelease(i).status).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('untested operation remains explicit unknown', () => {
    const i = input();
    i.quality!.result.inputs.gaps.operations = ['b'.repeat(64)];
    expect(assessRelease(i).unknowns).toContainEqual({
      code: 'UNTESTED_OPERATION',
      ids: ['b'.repeat(64)],
    });
  });
  for (const kind of ['RISK', 'REQUIREMENT'] as const)
    for (const severity of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const)
      for (const covered of [true, false])
        it(`${kind} ${severity} covered ${covered}`, () => {
          const i = input();
          i.coverage = [
            {
              id,
              kind,
              severity: kind === 'RISK' ? severity : null,
              covered,
              failedRunIds: [],
              reviewId: id,
            },
          ];
          expect(assessRelease(i).status).toBe(
            covered ? 'CLEAR' : 'INSUFFICIENT_EVIDENCE',
          );
        });
  it.each(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const)(
    '%s risk assertion failure',
    (severity) => {
      const i = input();
      i.coverage = [
        {
          id,
          kind: 'RISK',
          severity,
          covered: true,
          failedRunIds: [id],
          reviewId: id,
        },
      ];
      expect(assessRelease(i).status).toBe(
        ['HIGH', 'CRITICAL'].includes(severity) ? 'BLOCKED' : 'CAUTION',
      );
    },
  );
  it('failed requirement coverage remains coverage with caution', () => {
    const i = input();
    i.coverage = [
      {
        id,
        kind: 'REQUIREMENT',
        severity: null,
        covered: true,
        failedRunIds: [id],
        reviewId: id,
      },
    ];
    expect(assessRelease(i).status).toBe('CAUTION');
  });
  for (const outcome of ['PASS', 'FAIL', 'ERROR', 'UNKNOWN'] as const)
    for (const ageBand of ['RECENT', 'AGING', 'STALE'] as const)
      it(`${outcome} ${ageBand}`, () => {
        const i = input();
        i.runs = [
          {
            operationHash: 'a'.repeat(64),
            runId: id,
            packageId: id,
            outcome,
            ageBand,
            asserted: ['PASS', 'FAIL'].includes(outcome),
          },
        ];
        const r = assessRelease(i);
        expect(r.blockers).toHaveLength(0);
        expect(r.status).toBe(
          ageBand === 'STALE' || outcome === 'UNKNOWN'
            ? 'INSUFFICIENT_EVIDENCE'
            : outcome === 'FAIL' ||
                outcome === 'ERROR' ||
                (outcome === 'PASS' && ageBand === 'AGING')
              ? 'CAUTION'
              : 'CLEAR',
        );
      });
  it.each(['INCONCLUSIVE', 'STOPPED_BY_POLICY', 'BUDGET_EXHAUSTED'] as const)(
    '%s is caution, not defect',
    (conclusion) => {
      const i = input();
      i.investigations = [
        { id, status: 'CONCLUDED', conclusion, revision: 1, packageId: id },
      ];
      const r = assessRelease(i);
      expect(r.status).toBe('CAUTION');
      expect(r.blockers).toHaveLength(0);
    },
  );
  it.each(['OPEN', 'WAITING_FOR_APPROVAL', 'RUNNING'] as const)(
    '%s remains unresolved',
    (status) => {
      const i = input();
      i.investigations = [
        { id, status, conclusion: null, revision: 0, packageId: id },
      ];
      expect(assessRelease(i).status).toBe('INSUFFICIENT_EVIDENCE');
    },
  );
  it.each(['HYPOTHESIS_SUPPORTED', 'HYPOTHESIS_NOT_SUPPORTED'] as const)(
    '%s never confirms a finding',
    (conclusion) => {
      const i = input();
      i.investigations = [
        { id, status: 'CONCLUDED', conclusion, revision: 1, packageId: id },
      ];
      expect(assessRelease(i).status).toBe('CLEAR');
    },
  );
  it.each(['CURRENT', 'HISTORICAL', 'SUPERSEDED'] as const)(
    '%s memory cannot block',
    (currentness) => {
      const i = input();
      i.memory = [
        {
          id,
          kind: 'ASSERTION_FAILURE_OBSERVED',
          currentness,
          count: 5,
          caseId: id,
          packageId: id,
        },
      ];
      const r = assessRelease(i);
      expect(r.blockers).toHaveLength(0);
      expect(r.status).toBe(currentness === 'CURRENT' ? 'CAUTION' : 'CLEAR');
    },
  );
  it('identical state is deterministic', () => {
    const i = input();
    expect(assessRelease(i)).toEqual(assessRelease(structuredClone(i)));
  });
  it('unsupported quality version rejected', () => {
    const i = input();
    i.quality!.scoring_version = 'future';
    expect(() => assessRelease(i)).toThrow();
  });
  it('malformed finding identity rejected', () => {
    const i = input();
    i.findings = [{ ...finding('CONFIRMED', 'HIGH'), id: 'forged' }];
    expect(() => assessRelease(i)).toThrow();
  });
});
it.each(['OWNER', 'ADMIN', 'MEMBER'] as const)(
  '%s management authority',
  (role) => expect(canManageReleases(role)).toBe(role !== 'MEMBER'),
);
it.each([
  'postgresql://fixture:fixture@db.example.invalid/db',
  'Bearer fixture-token',
  'api_key=fixture',
  'password=fixture',
  '["postgresql://fixture:fixture@db.example.invalid/db","safe"]',
])('unsafe release text rejected', (value) =>
  expect(() => validateReleaseText(value, 1000)).toThrow(),
);
it.each([
  'Release 1.0',
  'Reviewed evidence; accepting documented risk.',
  'Password reset workflow',
])('safe release text retained', (value) =>
  expect(validateReleaseText(value, 120)).toBe(value),
);
it('bounded text enforced', () =>
  expect(() => validateReleaseText('x'.repeat(121), 120)).toThrow());
it('stale decision is historical, not current approval', () => {
  const release = { assessment_id: id } as Release;
  const d = {
    assessment_id: '14000000-0000-0000-0000-000000000002',
  } as ReleaseDecision;
  expect(releaseLifecycle(release, d)).toBe('ASSESSED');
  expect(releaseLifecycle(release, { ...d, assessment_id: id })).toBe(
    'DECIDED',
  );
  expect(releaseLifecycle({ ...release, assessment_id: null }, null)).toBe(
    'DRAFT',
  );
});

it('unknown execution delivery prevents CLEAR without inventing a finding', () => {
  const baseline = input();
  expect(assessRelease(baseline).status).toBe('CLEAR');
  const result = assessRelease({ ...baseline, indeterminateRunIds: [id] });
  expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
  expect(result.unknowns).toContainEqual({
    code: 'INDETERMINATE_EXECUTION',
    ids: [id],
  });
  expect(result.blockers).toEqual([]);
});
