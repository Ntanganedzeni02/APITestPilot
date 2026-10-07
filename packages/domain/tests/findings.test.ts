import { expect, it } from 'vitest';
import {
  classifyExecution,
  reviewTransition,
  validateFindingReview,
  validateInterpretation,
  findingSeverities,
  findingConfidences,
  evidenceKinds,
  type ExecutionResult,
  type EvidenceItem,
} from '../src/index.js';
const id = '14000000-0000-0000-0000-000000000001';
const failed: ExecutionResult = {
  outcome: 'FAILED',
  failure: null,
  sent: true,
  response: {
    status: 500,
    headers: {},
    body: null,
    contentType: 'application/json',
    bytes: 0,
    durationMs: 10,
    observedAt: '2026-10-07T00:00:00Z',
    bodyHandling: 'EMPTY',
  },
  assertions: [
    {
      kind: 'STATUS_IN_DECLARED_SET',
      expected: [200],
      pointer: '#/paths',
      status: 'FAIL',
      actual: '500',
      reason: 'Compared declared status.',
    },
  ],
};
it('classifies a real failed assertion separately from confirmation', () => {
  expect(classifyExecution(failed)).toEqual([
    {
      rule: 'ASSERTION_FAILED',
      severity: 'MEDIUM',
      confidence: 'HIGH',
      assertionIndex: 0,
    },
  ]);
});
it('successful assertions produce no candidates', () => {
  expect(
    classifyExecution({
      ...failed,
      outcome: 'PASSED',
      assertions: failed.assertions.map((a) => ({ ...a, status: 'PASS' })),
    }),
  ).toEqual([]);
});
it('does not infer assertions when no response was observed', () => {
  expect(classifyExecution({ ...failed, sent: false, response: null })).toEqual(
    [],
  );
});
it.each(['TIMEOUT', 'CONNECTION_TIMEOUT'] as const)(
  'classifies %s as infrastructure with medium confidence',
  (failure) => {
    expect(classifyExecution({ ...failed, outcome: 'ERROR', failure })).toEqual(
      [
        {
          rule: 'EXECUTION_TIMEOUT',
          severity: 'INFO',
          confidence: 'MEDIUM',
          assertionIndex: null,
        },
      ],
    );
  },
);
it('transport is low confidence infrastructure evidence', () => {
  expect(
    classifyExecution({
      ...failed,
      outcome: 'ERROR',
      failure: 'TRANSPORT_FAILURE',
    })[0],
  ).toMatchObject({
    rule: 'TRANSPORT_FAILURE',
    severity: 'INFO',
    confidence: 'LOW',
  });
});
it.each([
  'CANCELLED',
  'SAFETY_BLOCKED',
  'BLOCK_AUTHORIZATION_STALE',
  'REQUEST_FINGERPRINT_CHANGED',
  'RESPONSE_CAPTURE_FAILURE',
] as const)('does not promote %s to an API defect', (failure) => {
  expect(classifyExecution({ ...failed, outcome: 'ERROR', failure })).toEqual(
    [],
  );
});
it.each(['CONFIRM', 'DISMISS'] as const)(
  'requires explicit human %s decision',
  (decision) => {
    expect(reviewTransition('CANDIDATE', decision)).toBe(
      decision === 'CONFIRM' ? 'CONFIRMED' : 'DISMISSED',
    );
  },
);
it.each(['CONFIRMED', 'DISMISSED'] as const)(
  'never overwrites %s review',
  (status) => {
    expect(() => reviewTransition(status, 'CONFIRM')).toThrow();
  },
);
it('closed severity/confidence/evidence taxonomies are distinct', () => {
  expect(findingSeverities).toContain('CRITICAL');
  expect(findingConfidences).not.toContain('CRITICAL');
  expect(evidenceKinds).not.toContain('RAW_RESPONSE');
});
it.each([-1, 0.5, NaN])('rejects invalid revision %s', (revision) => {
  expect(() =>
    validateFindingReview(id, revision, 'CONFIRM', 'HIGH', ''),
  ).toThrow();
});
it('accepts bounded human review without credentials', () => {
  expect(() =>
    validateFindingReview(
      id,
      0,
      'DISMISS',
      'LOW',
      'Reviewed against approved contract.',
    ),
  ).not.toThrow();
});
it.each([
  'token=fixture-value',
  'password:fixture-value',
  'sb_secret_fixture',
  'x'.repeat(1001),
])('rejects unsafe or oversized review note', (note) => {
  expect(() => validateFindingReview(id, 0, 'CONFIRM', 'HIGH', note)).toThrow();
});
const evidence: EvidenceItem[] = [
  { id, package_id: id, kind: 'ASSERTION_RESULT', assertion_index: 0 },
];
const proposal = {
  evidenceItemIds: [id],
  title: 'Declared status mismatch',
  summary: 'Proposal only; human review required.',
  proposedSeverity: 'HIGH',
  proposedConfidence: 'HIGH',
};
it('validates a non-authoritative structured interpretation', () => {
  expect(validateInterpretation(proposal, evidence)).toEqual(proposal);
  expect(proposal).not.toHaveProperty('status');
});
it.each([
  { ...proposal, status: 'CONFIRMED' },
  { ...proposal, execute: 'GET' },
  { ...proposal, evidenceItemIds: ['invented'] },
  { ...proposal, evidenceItemIds: [id, id] },
  { ...proposal, evidenceItemIds: [] },
  { ...proposal, proposedSeverity: 'EXTREME' },
  { ...proposal, summary: 'x'.repeat(2001) },
])('rejects invented evidence, authority and invalid AI output', (value) => {
  expect(() => validateInterpretation(value, evidence)).toThrow();
});

it.each([
  'Authorization: Bearer synthetic_fixture_value',
  'bearer synthetic_fixture_value',
  'https://fixture:synthetic_fixture_value@example.invalid',
  'postgresql://fixture:synthetic_fixture_value@localhost/fixture',
  'api_key=synthetic_fixture_value',
  'access_token: synthetic_fixture_value',
  'cookie=synthetic_fixture_value',
])(
  'rejects recognizable credential formats before review persistence',
  (note) => {
    expect(() => validateFindingReview(id, 0, 'CONFIRM', 'HIGH', note)).toThrow(
      'Invalid review',
    );
  },
);

it.each([
  'api key: synthetic_fixture_value',
  'api.key=synthetic_fixture_value',
])('preserves previously supported API key assignment recognition', (note) => {
  expect(() => validateFindingReview(id, 0, 'CONFIRM', 'HIGH', note)).toThrow();
});
