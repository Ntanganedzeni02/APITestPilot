import { describe, it, expect } from 'vitest';
import {
  assessQuality,
  freshnessPoints,
  qualityWeights,
  qualityTrend,
  riskWeights,
  findingPenalties,
  type QualityInputs,
  type QualityAssessment,
} from '../src/memory-quality.js';
const full: QualityInputs = {
  sourceId: 'source',
  analysisId: 'analysis',
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
    stateHash: 'state',
  },
};
const score = (changes: Partial<QualityInputs> = {}) =>
  assessQuality({ ...full, ...changes });
const snapshot = (
  changes: Partial<QualityInputs> = {},
  scope: Partial<QualityAssessment> = {},
): QualityAssessment => ({
  id: 'id',
  workspace_id: 'w',
  project_id: 'p',
  environment_id: 'e',
  api_import_id: 'source',
  fingerprint: 'hash',
  scoring_version: 'api-quality-v1',
  assessed_at: '2026-10-07',
  created_by: 'actor',
  result: score(changes),
  ...scope,
});
describe('explicit reproducible quality arithmetic', () => {
  it('weights total 100', () =>
    expect(Object.values(qualityWeights).reduce((a, b) => a + b, 0)).toBe(100));
  it('full evidence yields exact score', () =>
    expect(score()).toMatchObject({
      overall: 100,
      sufficiency: 100,
      confidence: 'HIGH',
      status: 'STRONG',
      scoringVersion: 'api-quality-v1',
    }));
  it('identical inputs produce identical explanations', () =>
    expect(score()).toEqual(score()));
  it.each([0, 1, 5, 10])('requirement coverage %i / 10', (covered) =>
    expect(
      score({ coveredRequirements: covered }).dimensions.requirements,
    ).toMatchObject({
      score: covered * 10,
      numerator: covered,
      denominator: 10,
    }),
  );
  it('missing requirements remain unknown without weight renormalization', () =>
    expect(
      score({ activeRequirements: 0, coveredRequirements: 0 }),
    ).toMatchObject({
      overall: 75,
      dimensions: { requirements: { score: null } },
    }));
  it.each([0, 1, 4, 10, 20])('weighted risk coverage %i / 20', (covered) =>
    expect(score({ coveredRiskWeight: covered }).dimensions.risks.score).toBe(
      covered * 5,
    ),
  );
  it('critical and high risks outweigh low risks', () => {
    expect(riskWeights).toEqual({ LOW: 1, MEDIUM: 2, HIGH: 4, CRITICAL: 8 });
    expect(
      score({ riskWeight: 5, coveredRiskWeight: 4 }).dimensions.risks.score,
    ).toBe(80);
    expect(
      score({ riskWeight: 5, coveredRiskWeight: 1 }).dimensions.risks.score,
    ).toBe(20);
  });
  it('missing risks remain unknown', () =>
    expect(
      score({ riskWeight: 0, coveredRiskWeight: 0 }).dimensions.risks.score,
    ).toBeNull());
  it.each([0, 100, 500, 900, 1000])('execution health %i / 1000', (points) =>
    expect(score({ executionPoints: points }).dimensions.execution.score).toBe(
      points / 10,
    ),
  );
  it('infrastructure zero health does not create findings', () =>
    expect(score({ executionPoints: 0 }).dimensions.findings.score).toBe(100));
  it.each(Object.entries(findingPenalties))(
    '%s confirmed penalty %i',
    (_severity, penalty) =>
      expect(
        score({
          knownOperations: 1,
          testedOperations: 1,
          executionPoints: 100,
          freshnessPoints: 100,
          findingPenalty: penalty,
        }).dimensions.findings.score,
      ).toBe(100 - penalty),
  );
  it('candidate is quarter of confirmed penalty', () =>
    expect(
      score({
        knownOperations: 1,
        testedOperations: 1,
        executionPoints: 100,
        freshnessPoints: 100,
        findingPenalty: 15,
      }).dimensions.findings.score,
    ).toBe(85));
  it('dismissed penalty is zero', () =>
    expect(score({ findingPenalty: 0 }).dimensions.findings.score).toBe(100));
  it.each([
    [0, 100],
    [7, 100],
    [8, 50],
    [30, 50],
    [31, 0],
    [365, 0],
  ])('age %i earns %i freshness', (age, points) =>
    expect(freshnessPoints(age!)).toBe(points),
  );
  it.each([-1, NaN, Infinity])('invalid evidence age %s rejected', (age) =>
    expect(() => freshnessPoints(age)).toThrow(),
  );
  it('aging evidence reduces freshness', () =>
    expect(score({ freshnessPoints: 500 }).dimensions.freshness.score).toBe(
      50,
    ));
  it('stale evidence contributes zero', () =>
    expect(score({ freshnessPoints: 0 }).dimensions.freshness.score).toBe(0));
  it('never-tested source stays unknown', () =>
    expect(
      score({
        testedOperations: 0,
        executionPoints: 0,
        freshnessPoints: 0,
        coveredRequirements: 0,
        coveredRiskWeight: 0,
      }),
    ).toMatchObject({
      overall: null,
      status: 'UNKNOWN',
      confidence: 'LOW',
      sufficiency: 0,
    }));
  it('no imported operations remains unknown', () =>
    expect(
      score({
        knownOperations: 0,
        testedOperations: 0,
        executionPoints: 0,
        freshnessPoints: 0,
      }),
    ).toMatchObject({ overall: null, status: 'UNKNOWN' }));
  it('one endpoint cannot give high confidence even when all known', () =>
    expect(
      score({
        knownOperations: 1,
        testedOperations: 1,
        executionPoints: 100,
        freshnessPoints: 100,
      }),
    ).toMatchObject({ overall: 100, confidence: 'LOW' }));
  it('tiny evidence in a broad API remains low sufficiency', () =>
    expect(
      score({
        knownOperations: 100,
        testedOperations: 1,
        executionPoints: 100,
        freshnessPoints: 100,
        coveredRequirements: 0,
        coveredRiskWeight: 0,
      }),
    ).toMatchObject({ sufficiency: 1, confidence: 'LOW' }));
  it('medium confidence requires three tested operations', () =>
    expect(
      score({
        testedOperations: 3,
        executionPoints: 300,
        freshnessPoints: 300,
      }),
    ).toMatchObject({ confidence: 'MEDIUM' }));
  it.each([0, 1, 10, 100, 1000])(
    'scores bounded for %i operations',
    (known) => {
      const r = score({
        knownOperations: known,
        testedOperations: known,
        executionPoints: 100 * known,
        freshnessPoints: 100 * known,
      });
      expect(r.overall ?? 0).toBeGreaterThanOrEqual(0);
      expect(r.overall ?? 0).toBeLessThanOrEqual(100);
    },
  );
  it.each([
    { testedOperations: 11 },
    { coveredRequirements: 11 },
    { coveredRiskWeight: 21 },
    { executionPoints: 1001 },
    { findingPenalty: 1001 },
    { freshnessPoints: 1001 },
    { riskWeight: -1 },
    { knownOperations: NaN },
    { knownOperations: 1.5 },
    { coveredRequirements: undefined } as unknown as Partial<QualityInputs>,
    { executionPoints: '100' } as unknown as Partial<QualityInputs>,
  ])('rejects impossible inputs %j', (changes) =>
    expect(() => score(changes)).toThrow(),
  );
});
describe('honest trend', () => {
  it('first assessment has no invented delta', () =>
    expect(qualityTrend(snapshot(), null)).toMatchObject({
      comparable: false,
      overall: null,
      reason: 'FIRST_ASSESSMENT',
    }));
  it('positive changes show exact changed dimensions', () =>
    expect(
      qualityTrend(snapshot(), snapshot({ executionPoints: 500 })),
    ).toMatchObject({ overall: 12, dimensions: { execution: 50 } }));
  it('negative changes show exact deltas', () =>
    expect(
      qualityTrend(snapshot({ executionPoints: 0 }), snapshot()),
    ).toMatchObject({ overall: -25, dimensions: { execution: -100 } }));
  it('unknown never subtracts as zero', () =>
    expect(
      qualityTrend(snapshot({ testedOperations: 0 }), snapshot()).overall,
    ).toBeNull());
  it.each([
    { workspace_id: 'other' },
    { project_id: 'other' },
    { environment_id: 'other' },
    { api_import_id: 'new-source' },
    { scoring_version: 'future' },
  ])('cross scope/version is not comparable %j', (scope) =>
    expect(qualityTrend(snapshot({}, scope), snapshot())).toMatchObject({
      comparable: false,
      overall: null,
    }),
  );
});

describe('provider-neutral bounded reads', () => {
  it('future Ask has only scoped read capabilities', async () => {
    const { createIntelligenceQueries } =
      await import('../src/memory-quality.js');
    const calls: unknown[] = [];
    const query = {
      listFacts: async (...args: unknown[]) => {
        calls.push(args);
        return [];
      },
      current: async (...args: unknown[]) => {
        calls.push(args);
        return { current: snapshot(), previous: null };
      },
      history: async () => [],
    };
    const reads = createIntelligenceQueries(query);
    await reads.operationHistory('w', 'p', 'e', 'operation', 2);
    expect(calls[0]).toEqual([
      'w',
      'p',
      'e',
      { operation: 'operation', page: 2 },
    ]);
    await reads.findingHistory('w', 'p', 'e', true);
    expect(calls[1]).toEqual([
      'w',
      'p',
      'e',
      { kind: 'FINDING_DISMISSED', page: 0 },
    ]);
    await reads.investigationHistory('w', 'p', 'e');
    expect(calls[2]).toEqual([
      'w',
      'p',
      'e',
      { kind: 'INVESTIGATION_CONCLUDED', page: 0 },
    ]);
    expect(await reads.qualityGaps('w', 'p', 'e')).toEqual(full.gaps);
    expect(Object.keys(reads)).not.toContain('write');
  });
});

it('unresolved penalties remain when another operation loses freshness', () =>
  expect(
    assessQuality({ ...full, testedOperations: 1, findingPenalty: 600 })
      .dimensions.findings.score,
  ).toBe(40));

it('rational sufficiency rounds a half tie exactly like PostgreSQL numeric', () =>
  expect(
    assessQuality({
      ...full,
      knownOperations: 9,
      testedOperations: 3,
      activeRequirements: 8,
      coveredRequirements: 1,
      riskWeight: 6,
      coveredRiskWeight: 3,
      executionPoints: 300,
      findingPenalty: 67.5,
      freshnessPoints: 300,
    }).sufficiency,
  ).toBe(33));

// Deliberate synthetic security fixtures; never real credentials.
it.each([
  '["OPERATION","GET /postgresql://fixture:fixture@db.example.invalid/db"]',
  '["OPERATION","GET /Bearer fixture-token"]',
  '["OPERATION","GET /api_key=fixture"]',
  '["OPERATION","GET /password=fixture"]',
  '["OPERATION","GET /postgresql%3A%2F%2Ffixture%3Afixture%40db.example.invalid/db"]',
])('unsafe memory operation rejected', async (value) => {
  const { assertMemoryOperation } = await import('../src/memory-quality.js');
  expect(() => assertMemoryOperation(value)).toThrow('Unsafe memory operation');
});
it('null operation retains safe provenance representation', async () => {
  const { assertMemoryOperation } = await import('../src/memory-quality.js');
  expect(() => assertMemoryOperation(null)).not.toThrow();
  expect(() =>
    assertMemoryOperation('["OPERATION","GET /users"]'),
  ).not.toThrow();
});

it('SQL memory guard uses the existing recognizable credential formats', async () => {
  const { readFileSync } = await import('node:fs');
  const { recognizableCredentialPattern } =
    await import('../src/credentials.js');
  const sql = readFileSync(
    new URL(
      '../../../supabase/migrations/20261007000900_memory_quality_intelligence.sql',
      import.meta.url,
    ),
    'utf8',
  );
  expect(sql).toContain(
    `return decoded !~* '${recognizableCredentialPattern}'`,
  );
});
