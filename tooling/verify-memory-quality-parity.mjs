import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { assessQuality } from '../packages/domain/dist/memory-quality.js';
const [psql, database] = process.argv.slice(2);
if (!psql || !database || !/^[a-z0-9_]*m110_[a-z0-9_]+$/.test(database))
  throw Error('Use a disposable local m110 database.');
const full = {
  sourceId: null,
  analysisId: null,
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
    stateHash: 'fixture',
  },
};
const vectors = [
  {},
  { coveredRequirements: 0 },
  { coveredRequirements: 3 },
  { activeRequirements: 0, coveredRequirements: 0 },
  { coveredRiskWeight: 1 },
  { riskWeight: 5, coveredRiskWeight: 4 },
  { riskWeight: 0, coveredRiskWeight: 0 },
  { executionPoints: 500 },
  { findingPenalty: 7.5 },
  { findingPenalty: 600 },
  { freshnessPoints: 500 },
  { freshnessPoints: 0 },
  {
    knownOperations: 100,
    testedOperations: 1,
    executionPoints: 100,
    freshnessPoints: 100,
    coveredRequirements: 0,
    coveredRiskWeight: 0,
  },
  { testedOperations: 0, executionPoints: 0, freshnessPoints: 0 },
  {
    knownOperations: 0,
    testedOperations: 0,
    executionPoints: 0,
    freshnessPoints: 0,
  },
  { testedOperations: 3, executionPoints: 300, freshnessPoints: 300 },
];
// Deterministic generated boundary vectors exercise fractional weights and rounding.
for (let n = 1; n <= 128; n++) {
  const known = 1 + (n % 13),
    tested = n % (known + 1),
    requirements = 1 + (n % 11),
    risks = 1 + (n % 17);
  vectors.push({
    knownOperations: known,
    testedOperations: tested,
    activeRequirements: requirements,
    coveredRequirements: n % (requirements + 1),
    riskWeight: risks,
    coveredRiskWeight: n % (risks + 1),
    executionPoints: tested * (n % 2 ? 100 : 50),
    findingPenalty: (n % 5) * known * 2.5,
    freshnessPoints: tested * (n % 3 ? 100 : 50),
  });
}
let passed = 0;
for (const vector of vectors) {
  const input = { ...full, ...vector };
  const sql = `select public.compute_api_quality('${JSON.stringify(input).replaceAll("'", "''")}'::jsonb);`;
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
      ],
      { input: sql, encoding: 'utf8' },
    ),
  );
  const expected = assessQuality(input);
  const canonical = (v) =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected)))
    throw Error(
      'SQL/domain scoring mismatch for vector ' +
        passed +
        ': ' +
        JSON.stringify({ input, actual, expected }),
    );
  passed++;
}
process.stdout.write(
  `SQL/domain arithmetic parity: PASS ? ${passed} vectors. No HTTP or hosted data.\n`,
);
