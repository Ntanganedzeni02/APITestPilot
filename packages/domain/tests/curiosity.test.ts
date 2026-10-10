import { expect, it } from 'vitest';
import {
  validateCuriosityProposal,
  assertCuriosityBudget,
  proposalIdentity,
  investigationTransition,
  proposalTransition,
  conclusionFromResults,
} from '../src/curiosity.js';
import { id, now, fixture, proposal } from './curiosity-fixture.js';
it('accepts only grounded bounded proposal', () =>
  expect(validateCuriosityProposal(proposal(), fixture(), now)).toEqual(
    proposal(),
  ));
it.each([
  'url',
  'hostname',
  'headers',
  'authorization',
  'shell',
  'sql',
  'javascript',
  'graphNodeId',
  'operationId',
  'authority',
  'budget',
  'chainOfThought',
])('rejects extra %s', (field) =>
  expect(() =>
    validateCuriosityProposal(
      { ...proposal(), [field]: 'fixture' },
      fixture(),
      now,
    ),
  ).toThrow(),
);
it.each([
  'token=fixture',
  'Authorization: Bearer fixture',
  'cookie=fixture',
  'password=fixture',
  'sb_secret_fixture',
  'https://fixture:fixture@example.invalid',
  'https://example.invalid',
])('rejects unsafe rationale %s', (rationale) =>
  expect(() =>
    validateCuriosityProposal({ ...proposal(), rationale }, fixture(), now),
  ).toThrow(),
);
it.each([
  null,
  [],
  {},
  '{}',
  { ...proposal(), caseId: 'unknown' },
  { ...proposal(), confidence: 'CERTAIN' },
  { ...proposal(), hypothesis: 'Defect proven.' },
  { ...proposal(), evidenceItemIds: [] },
  { ...proposal(), evidenceItemIds: [id, id] },
  { ...proposal(), evidenceItemIds: ['unknown'] },
  { ...proposal(), bindings: [{ value: 123 }] },
  { ...proposal(), dependencyId: id },
  { ...proposal(), rationale: 'x'.repeat(1001) },
])('fails closed on invalid structured proposal %#', (raw) =>
  expect(() => validateCuriosityProposal(raw, fixture(), now)).toThrow(),
);
it('expired investigation rejects even valid output', () =>
  expect(() =>
    validateCuriosityProposal(proposal(), fixture(), now + 3600000),
  ).toThrow());
it.each(['STOPPED', 'CONCLUDED'] as const)(
  'closed %s rejects proposals',
  (status) => {
    const c = fixture();
    c.investigation.status = status;
    expect(() => validateCuriosityProposal(proposal(), c, now)).toThrow();
  },
);
it('model prose does not change equivalence', () =>
  expect(proposalIdentity(proposal())).toBe(
    proposalIdentity({
      ...proposal(),
      rationale: 'Other words.',
      confidence: 'HIGH',
    }),
  ));
it('dependency changes executable identity', () =>
  expect(proposalIdentity(proposal())).not.toBe(
    proposalIdentity({ ...proposal(), dependencyId: id }),
  ));
it.each(['proposed', 'executable', 'depth', 'repeats'])(
  'enforces %s budget',
  (limit) => {
    const c = fixture();
    const step = {
      ...proposal(),
      id,
      investigation_id: id,
      status: 'EXECUTED' as const,
      fingerprint: 'f',
      approved_fingerprint: 'f',
      revision: 1,
      operation_id: c.cases[0]!.operation,
      run_id: null,
      result_package_id: id,
      depth: 0,
    };
    if (limit === 'proposed')
      c.proposals = Array.from({ length: 8 }, () => ({
        ...step,
        operation_id: 'other',
      }));
    if (limit === 'executable')
      c.proposals = Array.from({ length: 3 }, () => ({
        ...step,
        operation_id: 'other',
        run_id: id,
      }));
    if (limit === 'repeats') c.proposals = [step, step];
    if (limit === 'depth') c.proposals = [{ ...step, depth: 2 }];
    expect(() =>
      assertCuriosityBudget(c, id, limit === 'depth' ? id : null, now),
    ).toThrow();
  },
);
it('executed dependency supported with resulting evidence', () => {
  const c = fixture();
  c.proposals = [
    {
      ...proposal(),
      id,
      investigation_id: id,
      status: 'EXECUTED',
      fingerprint: 'f',
      approved_fingerprint: 'f',
      revision: 1,
      operation_id: 'other',
      run_id: id,
      result_package_id: id,
      depth: 0,
    },
  ];
  expect(() =>
    validateCuriosityProposal({ ...proposal(), dependencyId: id }, c, now),
  ).not.toThrow();
});
it('closed investigation cannot restart', () =>
  expect(investigationTransition('CONCLUDED', 'OPEN')).toBe(false));
it('no approval-to-execution shortcut', () =>
  expect(proposalTransition('PROPOSED', 'EXECUTED')).toBe(false));
it('rejected proposal cannot approve later', () =>
  expect(proposalTransition('REJECTED', 'APPROVED')).toBe(false));
it.each([
  [['PASSED'], 'HYPOTHESIS_SUPPORTED'],
  [['FAILED'], 'HYPOTHESIS_NOT_SUPPORTED'],
  [['ERROR'], 'INCONCLUSIVE'],
  [['BLOCKED'], 'STOPPED_BY_POLICY'],
] as const)('conclusion from actual outcome %j', (outcomes, expected) =>
  expect(conclusionFromResults([...outcomes])).toBe(expected),
);
it('conclusion requires results', () =>
  expect(() => conclusionFromResults([])).toThrow());

it('safe observed status binds only to exact trusted parameter and evidence', () => {
  const c = fixture();
  c.observedValues = [
    {
      caseId: id,
      evidenceItemId: id,
      field: 'response.status',
      value: 500,
      parameterPointer: '#/fixture/status',
    },
  ];
  expect(
    validateCuriosityProposal(
      {
        ...proposal(),
        bindings: [
          {
            evidenceItemId: id,
            field: 'response.status',
            parameterPointer: '#/fixture/status',
          },
        ],
      },
      c,
      now,
    ).bindings,
  ).toHaveLength(1);
});
it.each([
  'password',
  'authorization',
  'cookie',
  'token',
  'id',
  'response.body.id',
])('sensitive/ungrounded observed field %s rejected', (field) => {
  const c = fixture();
  c.observedValues = [
    {
      caseId: id,
      evidenceItemId: id,
      field,
      value: 123,
      parameterPointer: '#/fixture',
    },
  ];
  expect(() =>
    validateCuriosityProposal(
      {
        ...proposal(),
        bindings: [
          { evidenceItemId: id, field, parameterPointer: '#/fixture' },
        ],
      },
      c,
      now,
    ),
  ).toThrow();
});
it('cross-case observed binding rejected', () => {
  const c = fixture();
  c.observedValues = [
    {
      caseId: 'other',
      evidenceItemId: id,
      field: 'response.status',
      value: 200,
      parameterPointer: '#/fixture',
    },
  ];
  expect(() =>
    validateCuriosityProposal(
      {
        ...proposal(),
        bindings: [
          {
            evidenceItemId: id,
            field: 'response.status',
            parameterPointer: '#/fixture',
          },
        ],
      },
      c,
      now,
    ),
  ).toThrow();
});

it.each([
  [['PASSED'], false, 'HYPOTHESIS_SUPPORTED'],
  [['FAILED', 'PASSED'], false, 'HYPOTHESIS_NOT_SUPPORTED'],
  [['PASSED', 'BLOCKED'], false, 'INCONCLUSIVE'],
  [['PASSED', 'CANCELLED'], false, 'INCONCLUSIVE'],
  [['PASSED', 'ERROR'], false, 'INCONCLUSIVE'],
  [['BLOCKED', 'CANCELLED'], false, 'STOPPED_BY_POLICY'],
  [['PASSED', 'BLOCKED', 'CANCELLED'], true, 'BUDGET_EXHAUSTED'],
] as const)(
  'conservative conclusion %j budget %s',
  (outcomes, exhausted, expected) => {
    expect(conclusionFromResults([...outcomes], exhausted)).toBe(expected);
  },
);
