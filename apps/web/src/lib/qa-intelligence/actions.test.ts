import { beforeEach, expect, it, vi } from 'vitest';
import { PersistenceError } from '@testpilot/database';
const m = vi.hoisted(() => ({
  tenant: vi.fn(),
  list: vi.fn(),
  review: vi.fn(),
  revalidate: vi.fn(),
  add: vi.fn(),
  save: vi.fn(),
  sources: vi.fn(),
  graphs: vi.fn(),
}));
vi.mock('../auth/server', () => ({
  requireUser: async () => ({ client: {} }),
}));
vi.mock('../tenancy/context', () => ({ getTenantContext: m.tenant }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));
vi.mock('@testpilot/database', async (original) => ({
  ...(await original<typeof import('@testpilot/database')>()),
  createQaRepository: () => ({
    list: m.list,
    review: m.review,
    add: m.add,
    save: m.save,
  }),
  createApiKnowledgeRepository: () => ({ list: m.sources }),
  createBehaviourGraphRepository: () => ({ list: m.graphs }),
}));
import { qaAction } from './actions';
import {
  analysis,
  requirement,
  source,
  snapshot,
} from '../../components/qa-intelligence/requirements.test-fixture';
function form(decision = 'APPROVE') {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    mode: 'REVIEW',
    itemId: requirement.id,
    expectedReviewId: '',
    decision,
    rationale: '',
    title: 'Revised title',
    statement: 'Revised statement',
  }))
    f.set(k, v);
  return f;
}
beforeEach(() => {
  m.tenant.mockResolvedValue({
    workspace: { id: analysis.workspaceId, role: 'OWNER' },
    project: { id: analysis.projectId },
  });
  m.list.mockResolvedValue([analysis]);
  m.review.mockResolvedValue('review-id');
});
it.each(['APPROVE', 'REJECT'])(
  'preserves %s decision, scope and null edit payload with optional rationale',
  async (decision) => {
    expect(await qaAction({}, form(decision))).toEqual({ saved: true });
    expect(m.list).toHaveBeenCalledWith(
      analysis.workspaceId,
      analysis.projectId,
    );
    expect(m.review).toHaveBeenCalledWith(
      requirement.id,
      null,
      decision,
      '',
      null,
      null,
    );
    expect(m.revalidate).toHaveBeenCalledWith('/requirements');
  },
);
it('EDIT sends current version and revised text without converting it to approval', async () => {
  const f = form('EDIT');
  f.set('expectedReviewId', '15000000-0000-0000-0000-000000000020');
  expect(await qaAction({}, f)).toEqual({ saved: true });
  expect(m.review).toHaveBeenCalledWith(
    requirement.id,
    '15000000-0000-0000-0000-000000000020',
    'EDIT',
    '',
    'Revised title',
    'Revised statement',
  );
});
it('permission checks block member approval and allow member edits', async () => {
  m.tenant.mockResolvedValue({
    workspace: { id: analysis.workspaceId, role: 'MEMBER' },
    project: { id: analysis.projectId },
  });
  expect((await qaAction({}, form())).error).toContain('role');
  expect(m.review).not.toHaveBeenCalled();
  expect(await qaAction({}, form('EDIT'))).toEqual({ saved: true });
});
it('foreign/unavailable items never reach persistence and malformed rationale is rejected', async () => {
  const f = form();
  f.set('itemId', '15000000-0000-0000-0000-000000000099');
  expect((await qaAction({}, f)).error).toContain('unavailable');
  expect(m.review).not.toHaveBeenCalled();
  const long = form();
  long.set('rationale', 'x'.repeat(2001));
  expect((await qaAction({}, long)).error).toContain('Invalid');
  expect(m.review).not.toHaveBeenCalled();
});
it('stale review conflicts stay visible without revalidation or accounting changes', async () => {
  m.review.mockRejectedValueOnce(new PersistenceError('CONFLICT'));
  expect((await qaAction({}, form())).error).toContain('Reload');
  expect(m.revalidate).not.toHaveBeenCalled();
  expect(m.save).not.toHaveBeenCalled();
});
it('creating an analysis still uses exact source/graph identifiers and the existing explicit handler', async () => {
  m.sources.mockResolvedValue([source]);
  m.graphs.mockResolvedValue([snapshot]);
  const f = new FormData();
  f.set('mode', 'ANALYZE');
  f.set('importId', source.id);
  f.set('graphId', snapshot.id);
  expect(await qaAction({}, f)).toEqual({ saved: true });
  expect(m.sources).toHaveBeenCalledWith(
    analysis.workspaceId,
    analysis.projectId,
    source.id,
  );
  expect(m.graphs).toHaveBeenCalledWith(
    analysis.workspaceId,
    analysis.projectId,
    source.id,
    snapshot.id,
  );
  expect(m.save).toHaveBeenCalledOnce();
});

it('human risk creation preserves authorized graph evidence and severity without approval', async () => {
  m.graphs.mockResolvedValue([snapshot]);
  const f = new FormData();
  for (const [key, value] of Object.entries({
    mode: 'ADD',
    analysisId: analysis.id,
    kind: 'RISK',
    title: 'Human risk',
    statement: 'Review this specification risk',
    reason: 'Human observation',
    category: 'AUTHORIZATION',
    severity: 'HIGH',
    nodeId: snapshot.graph.nodes[0]!.id,
  }))
    f.set(key, value);
  expect(await qaAction({}, f)).toEqual({ saved: true });
  expect(m.add).toHaveBeenCalledWith(
    analysis.id,
    expect.objectContaining({
      kind: 'RISK',
      severity: 'HIGH',
      priority: 'ROUTINE',
      sourceKind: 'HUMAN_AUTHORED',
      nodeRefs: [snapshot.graph.nodes[0]!.id],
      requirementRefs: [],
    }),
  );
});
