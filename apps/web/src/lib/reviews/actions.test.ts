import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  scope: vi.fn(),
  role: 'OWNER',
  eq: vi.fn(),
}));
vi.mock('../auth/server', () => ({
  requireUser: async () => ({
    client: { rpc: h.rpc, from: () => ({ select: () => ({ eq: h.eq }) }) },
  }),
}));
vi.mock('../tenancy/context', () => ({
  getTenantContext: async () => ({
    workspace: { id: 'w', role: h.role },
    project: { id: 'p' },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { bulkReviewAction } from './actions';
const id = '16000000-0000-0000-0000-000000000001';
function form(decision = 'APPROVE', items = [{ id, expectedReviewId: null }]) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    family: 'QA',
    kind: 'REQUIREMENT',
    parentId: id,
    decision,
    rationale: 'Human reviewed selected proposals',
    confirmed: 'on',
    items: JSON.stringify(items),
  }))
    f.set(k, v);
  return f;
}
beforeEach(() => {
  vi.clearAllMocks();
  h.role = 'OWNER';
  h.eq.mockReturnValue({ eq: h.eq, maybeSingle: h.scope });
  h.scope.mockResolvedValue({ data: { id }, error: null });
  h.rpc.mockResolvedValue({ data: 1, error: null });
});
it('calls exactly one atomic RPC with active tenant-scoped parent and no AI/execution writes', async () => {
  expect(await bulkReviewAction({}, form())).toEqual({ saved: 1 });
  expect(h.rpc).toHaveBeenCalledOnce();
  expect(h.rpc.mock.calls[0]![0]).toBe('bulk_review_items');
  expect(h.eq).toHaveBeenCalledWith('workspace_id', 'w');
  expect(h.eq).toHaveBeenCalledWith('project_id', 'p');
});
it.each(['REJECT', 'EDIT'])(
  'enforces rationale and confirmation for %s',
  async (decision) => {
    const f = form(decision);
    f.set('rationale', ' ');
    expect((await bulkReviewAction({}, f)).error).toBeTruthy();
    expect(h.rpc).not.toHaveBeenCalled();
    f.set('rationale', 'Reason');
    f.delete('confirmed');
    expect((await bulkReviewAction({}, f)).error).toBeTruthy();
  },
);
it('rejects unauthorized or foreign-project context before admission', async () => {
  h.role = 'MEMBER';
  expect((await bulkReviewAction({}, form())).error).toContain('role');
  expect(h.rpc).not.toHaveBeenCalled();
  h.role = 'OWNER';
  h.scope.mockResolvedValue({ data: null, error: null });
  expect((await bulkReviewAction({}, form())).error).toContain('project');
  expect(h.rpc).not.toHaveBeenCalled();
});
it('concurrent/stale reviews report atomic failure without retry', async () => {
  h.rpc.mockResolvedValue({ data: null, error: { code: '40001' } });
  expect((await bulkReviewAction({}, form())).error).toContain(
    'Nothing changed',
  );
  expect(h.rpc).toHaveBeenCalledOnce();
});
it('missing migration is actionable and lost acknowledgment is not falsely called rollback', async () => {
  h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
  expect((await bulkReviewAction({}, form())).error).toContain('01400');
  h.rpc.mockResolvedValue({ data: null, error: { code: '' } });
  expect((await bulkReviewAction({}, form())).error).toContain('uncertain');
});
it('duplicate IDs are refused and mismatched result counts require history inspection', async () => {
  const f = form('APPROVE', [
    { id, expectedReviewId: null },
    { id, expectedReviewId: null },
  ]);
  expect((await bulkReviewAction({}, f)).error).toContain('distinct');
  expect(h.rpc).not.toHaveBeenCalled();
  h.rpc.mockResolvedValue({ data: 0, error: null });
  expect((await bulkReviewAction({}, form())).error).toContain('uncertain');
});
