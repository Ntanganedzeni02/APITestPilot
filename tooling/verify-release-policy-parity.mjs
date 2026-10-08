import { execFileSync } from 'node:child_process';
import { deepStrictEqual } from 'node:assert';
import process from 'node:process';
import { assessQuality, assessRelease } from '../packages/domain/dist/index.js';
const [psql, database] = process.argv.slice(2);
if (!psql || !database || !/^[a-z0-9_]*m111_[a-z0-9_]+$/.test(database))
  throw Error('Use a disposable local m111 database.');
const id = '14000000-0000-0000-0000-000000000001';
const base = {
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
const vectors = [
  base,
  { ...base, indeterminateRunIds: [] },
  { ...base, indeterminateRunIds: [id] },
  { ...base, quality: null, indeterminateRunIds: [id] },
  { ...base, quality: null },
  { ...base, sourceCurrent: false },
];
for (const severity of ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  for (const status of ['CANDIDATE', 'CONFIRMED', 'DISMISSED'])
    for (const sourceCurrent of [true, false])
      vectors.push({
        ...base,
        sourceCurrent,
        findings: [
          {
            id,
            severity,
            status,
            revision: 1,
            caseId: id,
            packageId: id,
            occurrences: 100,
            reviewIds: [id],
          },
        ],
      });
for (const kind of ['REQUIREMENT', 'RISK'])
  for (const severity of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
    for (const covered of [true, false])
      for (const failed of [true, false])
        vectors.push({
          ...base,
          coverage: [
            {
              id,
              kind,
              severity: kind === 'RISK' ? severity : null,
              covered,
              failedRunIds: failed ? [id] : [],
              reviewId: id,
            },
          ],
        });
for (const outcome of ['PASS', 'FAIL', 'ERROR', 'UNKNOWN'])
  for (const ageBand of ['RECENT', 'AGING', 'STALE'])
    vectors.push({
      ...base,
      runs: [
        {
          operationHash: 'a'.repeat(64),
          runId: id,
          packageId: id,
          outcome,
          ageBand,
          asserted: ['PASS', 'FAIL'].includes(outcome),
        },
      ],
    });
for (const status of [
  'OPEN',
  'WAITING_FOR_APPROVAL',
  'RUNNING',
  'CONCLUDED',
  'STOPPED',
])
  for (const conclusion of [
    null,
    'INCONCLUSIVE',
    'STOPPED_BY_POLICY',
    'BUDGET_EXHAUSTED',
    'HYPOTHESIS_SUPPORTED',
    'HYPOTHESIS_NOT_SUPPORTED',
  ])
    if (['CONCLUDED', 'STOPPED'].includes(status) === (conclusion !== null))
      vectors.push({
        ...base,
        investigations: [
          { id, status, conclusion, revision: 1, packageId: id },
        ],
      });
for (const currentness of ['CURRENT', 'HISTORICAL', 'SUPERSEDED'])
  for (const count of [1, 2, 100])
    vectors.push({
      ...base,
      memory: [
        {
          id,
          kind: 'ASSERTION_FAILURE_OBSERVED',
          currentness,
          count,
          caseId: id,
          packageId: id,
        },
      ],
    });
for (const sufficiency of [0, 39, 40, 79, 80, 81, 100])
  for (const confidence of ['LOW', 'MEDIUM', 'HIGH'])
    vectors.push({
      ...base,
      quality: {
        ...base.quality,
        result: { ...base.quality.result, sufficiency, confidence },
      },
    });
vectors.push({
  ...base,
  quality: {
    ...base.quality,
    result: { ...base.quality.result, overall: null },
  },
});
vectors.push({
  ...base,
  quality: {
    ...base.quality,
    result: {
      ...base.quality.result,
      inputs: {
        ...base.quality.result.inputs,
        gaps: { requirements: [], risks: [], operations: ['b'.repeat(64)] },
      },
    },
  },
});
vectors.push({
  ...vectors[3],
  quality: null,
  investigations: [
    { id, status: 'OPEN', conclusion: null, revision: 0, packageId: id },
  ],
});
for (const input of vectors) {
  const sql = `begin read only;select public.compute_release_policy('${JSON.stringify(input).replaceAll("'", "''")}'::jsonb);rollback;`;
  const actual = JSON.parse(
    execFileSync(
      psql,
      [
        '-X',
        '-qAt',
        '-h',
        '127.0.0.1',
        '-p',
        '55433',
        '-U',
        'postgres',
        '-d',
        database,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        sql,
      ],
      { encoding: 'utf8', timeout: 15000 },
    ),
  );
  deepStrictEqual(actual, assessRelease(input));
}
process.stdout.write(
  `Release policy SQL/domain parity: PASS ? ${vectors.length} vectors. No hosted data, HTTP or AI.\n`,
);
