import { it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createReleaseRepository,
  decodeReleaseAssessment,
  decodeReleaseReport,
  decodeReleaseDecision,
} from '../src/release-intelligence.js';
import {
  id,
  other,
  assessmentFixture,
  reportFixture,
  decisionFixture,
  releaseFixture,
} from './release-fixtures.js';
function client(data: unknown = []) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const key of ['select', 'eq', 'order', 'range', 'limit'])
    q[key] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => ({ data, error: null }));
  q.then = vi.fn((resolve: (v: unknown) => unknown) =>
    resolve({ data, error: null }),
  );
  const from = vi.fn(() => q);
  const rpc = vi.fn(async () => ({ data: id, error: null }));
  return {
    q,
    from,
    rpc,
    repo: createReleaseRepository({ from, rpc } as unknown as SupabaseClient),
  };
}
it('assessment sends only release selector', async () => {
  const c = client();
  await c.repo.assess(id);
  expect(c.rpc).toHaveBeenCalledExactlyOnceWith('assess_release', {
    release_input: id,
  });
});
it('create sends selected project environment and safe identity', async () => {
  const c = client();
  await c.repo.create(id, other, ' Release fixture ');
  expect(c.rpc).toHaveBeenCalledExactlyOnceWith('create_release', {
    project_input: id,
    environment_input: other,
    name_input: 'Release fixture',
  });
});
it('decision excludes actor and timestamp authority', async () => {
  const c = client();
  await c.repo.decide(id, id, null, 'REJECT', 'Reviewed evidence.');
  expect(c.rpc).toHaveBeenCalledExactlyOnceWith('decide_release', {
    release_input: id,
    assessment_input: id,
    expected_decision: null,
    decision_input: 'REJECT',
    rationale_input: 'Reviewed evidence.',
  });
});
it('report sends only scoped immutable selectors', async () => {
  const c = client();
  await c.repo.generate(id, other);
  expect(c.rpc).toHaveBeenCalledExactlyOnceWith('generate_release_report', {
    release_input: id,
    assessment_input: other,
  });
});
it.each([
  'Bearer fixture-token',
  'password=fixture',
  'postgresql://fixture:fixture@db.example.invalid/db',
])('credential text never sent to persistence', async (value) => {
  const c = client();
  expect(() => c.repo.create(id, id, value)).toThrow();
  expect(() =>
    c.repo.decide(id, id, null, 'APPROVE_WITH_RISK', value),
  ).toThrow();
  expect(c.rpc).not.toHaveBeenCalled();
});
it('malformed selector never reaches RPC', () => {
  const c = client();
  expect(() => c.repo.assess('bad')).toThrow();
  expect(c.rpc).not.toHaveBeenCalled();
});
it('invalid decision enum rejected', () => {
  const c = client();
  expect(() =>
    c.repo.decide(id, id, null, 'AUTO_APPROVE', 'Reviewed.'),
  ).toThrow();
});
it('list scopes workspace/project and pagination', async () => {
  const c = client([releaseFixture()]);
  await c.repo.list(id, other, 2);
  expect(c.q.eq).toHaveBeenCalledWith('workspace_id', id);
  expect(c.q.eq).toHaveBeenCalledWith('project_id', other);
  expect(c.q.range).toHaveBeenCalledWith(50, 74);
});
it.each([-1, 1.2, 10001])('invalid page %s rejected', async (page) => {
  const c = client();
  await expect(c.repo.reports(id, id, page)).rejects.toThrow();
  expect(c.from).not.toHaveBeenCalled();
});
it('report read is scoped and returns persisted content', async () => {
  const c = client(reportFixture());
  expect(await c.repo.report(id, id, id)).toEqual(reportFixture());
  expect(c.q.eq).toHaveBeenCalledWith('id', id);
});
it('missing report returns null', async () =>
  expect(await client(null).repo.report(id, id, id)).toBeNull());
it('valid persisted assessment decoded', () =>
  expect(decodeReleaseAssessment(assessmentFixture())).toEqual(
    assessmentFixture(),
  ));
it.each([
  'workspace_id',
  'project_id',
  'environment_id',
  'api_import_id',
] as const)('incompatible quality %s rejected', (key) => {
  const a = assessmentFixture();
  a.result.inputs.quality![key] = other;
  expect(() => decodeReleaseAssessment(a)).toThrow();
});
it('forged status rejected', () => {
  const a = assessmentFixture();
  a.result.status = 'BLOCKED';
  expect(() => decodeReleaseAssessment(a)).toThrow();
});
it('forged blocker rejected', () => {
  const a = assessmentFixture();
  a.result.blockers = [{ code: 'FABRICATED', ids: [id] }];
  expect(() => decodeReleaseAssessment(a)).toThrow();
});
it('forged quality score rejected', () => {
  const a = assessmentFixture();
  a.result.inputs.quality!.result.overall = 0;
  expect(() => decodeReleaseAssessment(a)).toThrow();
});
it('unsupported policy rejected', () => {
  const a = assessmentFixture();
  Object.assign(a, { policy_version: 'future' });
  expect(() => decodeReleaseAssessment(a)).toThrow();
});
it('report decision assessment substitution rejected', () => {
  const r = reportFixture();
  r.snapshot.decision = { ...decisionFixture(), assessment_id: other };
  r.decision_id = id;
  expect(() => decodeReleaseReport(r)).toThrow();
});
it('report scope substitution rejected', () => {
  const r = reportFixture();
  r.snapshot.release.environment_id = other;
  expect(() => decodeReleaseReport(r)).toThrow();
});
it('report note credential rejected before display', () => {
  const r = reportFixture();
  r.snapshot.decision = { ...decisionFixture(), rationale: 'password=fixture' };
  r.decision_id = id;
  expect(() => decodeReleaseReport(r)).toThrow();
});
it('valid human decision decoded', () =>
  expect(decodeReleaseDecision(decisionFixture())).toEqual(decisionFixture()));
