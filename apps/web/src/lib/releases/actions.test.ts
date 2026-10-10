import { it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({
  context: vi.fn(),
  create: vi.fn(),
  assess: vi.fn(),
  decide: vi.fn(),
  generate: vi.fn(),
  detail: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('./context', () => ({ releaseContext: m.context }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));
import { releaseAction } from './actions';
const id = '14000000-0000-0000-0000-000000000001';
function form(mode: string) {
  const f = new FormData();
  for (const [key, value] of Object.entries({
    mode,
    environmentId: id,
    releaseId: id,
    assessmentId: id,
    expectedDecision: '',
    decision: 'APPROVE_WITH_RISK',
    rationale: 'Accepted known risk.',
    name: 'Local fixture',
  }))
    f.set(key, value);
  return f;
}
beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.context.mockResolvedValue({
    workspace: { id, role: 'OWNER' },
    project: { id },
    environment: { id },
    repo: {
      create: m.create,
      assess: m.assess,
      decide: m.decide,
      generate: m.generate,
      detail: m.detail,
    },
  });
  m.detail.mockResolvedValue({ release: { id, environment_id: id } });
  for (const fn of [m.create, m.assess, m.decide, m.generate])
    fn.mockResolvedValue(id);
});
it.each(['CREATE', 'ASSESS', 'DECIDE', 'REPORT'])(
  '%s action succeeds through controlled boundary',
  async (mode) =>
    expect(await releaseAction({}, form(mode))).toHaveProperty('href'),
);
it('browser actor score and report body ignored', async () => {
  const f = form('DECIDE');
  f.set('actor', 'forged');
  f.set('score', '100');
  f.set('report', 'forged');
  await releaseAction({}, f);
  expect(m.decide).toHaveBeenCalledExactlyOnceWith(
    id,
    id,
    null,
    'APPROVE_WITH_RISK',
    'Accepted known risk.',
  );
});
it('MEMBER denied before any mutation', async () => {
  m.context.mockResolvedValue({ workspace: { id, role: 'MEMBER' } });
  expect(await releaseAction({}, form('CREATE'))).toHaveProperty('error');
  expect(m.create).not.toHaveBeenCalled();
});
it('cross-project or inaccessible release denied', async () => {
  m.detail.mockResolvedValue(null);
  expect(await releaseAction({}, form('REPORT'))).toHaveProperty('error');
  expect(m.generate).not.toHaveBeenCalled();
});
it('environment substitution denied', async () => {
  m.detail.mockResolvedValue({ release: { environment_id: 'other' } });
  expect(await releaseAction({}, form('ASSESS'))).toHaveProperty('error');
  expect(m.assess).not.toHaveBeenCalled();
});
it('stale backend errors sanitized', async () => {
  m.decide.mockRejectedValue(Error('private SQL credential'));
  const result = await releaseAction({}, form('DECIDE'));
  expect(result.error).toContain('Refresh');
  expect(result.error).not.toContain('private SQL');
});
it('unsupported intent rejected', async () =>
  expect(await releaseAction({}, form('AUTO_DEPLOY'))).toHaveProperty('error'));
