import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  user: vi.fn(),
  tenant: vi.fn(),
  context: vi.fn(),
  derive: vi.fn(),
  propose: vi.fn(),
  decide: vi.fn(),
  materialize: vi.fn(),
  refresh: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('../auth/server', () => ({ requireUser: m.user }));
vi.mock('../tenancy/context', () => ({ getTenantContext: m.tenant }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));
vi.mock('@testpilot/database', async (original) => ({
  ...(await original<typeof import('@testpilot/database')>()),
  createInvestigationRepository: () => ({
    context: m.context,
    derive: m.derive,
    propose: m.propose,
    decide: m.decide,
    materialize: m.materialize,
    refresh: m.refresh,
  }),
}));
import { investigationAction } from './actions';
import { PersistenceError } from '@testpilot/database';
import {
  fixture,
  proposal,
  id,
} from '../../../../../packages/domain/tests/curiosity-fixture.js';
function form(mode = 'APPROVE') {
  const f = new FormData();
  f.set('mode', mode);
  f.set('investigationId', id);
  f.set('proposalId', id);
  f.set('revision', '7');
  f.set('fingerprint', 'a'.repeat(64));
  return f;
}
beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.user.mockResolvedValue({ client: {} });
  m.tenant.mockResolvedValue({
    workspace: { id, role: 'OWNER' },
    project: { id },
  });
  const c = fixture();
  c.proposals = [
    {
      ...proposal(),
      id,
      investigation_id: id,
      status: 'PROPOSED',
      fingerprint: 'a'.repeat(64),
      approved_fingerprint: null,
      revision: 8,
      operation_id: 'fixture',
      run_id: null,
      result_package_id: null,
      depth: 0,
    },
  ];
  m.context.mockResolvedValue(c);
  m.decide.mockResolvedValue(id);
  m.materialize.mockResolvedValue(id);
});
it('no tenant means no mutation', async () => {
  m.tenant.mockResolvedValue({});
  expect(await investigationAction({}, form())).toHaveProperty('error');
  expect(m.decide).not.toHaveBeenCalled();
});
it('loads context for selected project before action', async () => {
  expect(await investigationAction({}, form())).toHaveProperty('saved', true);
  expect(m.context).toHaveBeenCalledWith(id, id, id);
});
it('never upgrades stale submitted revision to loaded revision', async () => {
  await investigationAction({}, form());
  expect(m.decide).toHaveBeenCalledWith(id, 7, 'a'.repeat(64), true);
});
it('cross project context failure prevents action', async () => {
  m.context.mockRejectedValue(new PersistenceError('ACCESS'));
  expect(await investigationAction({}, form())).toHaveProperty('error');
  expect(m.decide).not.toHaveBeenCalled();
});
it('stale action not fake success', async () => {
  m.decide.mockRejectedValue(new PersistenceError('CONFLICT'));
  const state = await investigationAction({}, form());
  expect(state.saved).toBeUndefined();
  expect(state.error).toContain('Reload');
  expect(m.revalidate).not.toHaveBeenCalled();
});
it('unknown proposal cannot be approved', async () => {
  const f = form();
  f.set('proposalId', 'unknown');
  expect(await investigationAction({}, f)).toHaveProperty('error');
  expect(m.decide).not.toHaveBeenCalled();
});
it.each(['', '-1', '0.5'])('bad revision %s rejected', async (rev) => {
  const f = form();
  f.set('revision', rev);
  expect(await investigationAction({}, f)).toHaveProperty('error');
  expect(m.decide).not.toHaveBeenCalled();
});
it('materialization forwards exact submitted fingerprint', async () => {
  const f = form('MATERIALIZE');
  f.set('fingerprint', 'b'.repeat(64));
  await investigationAction({}, f);
  expect(m.materialize).toHaveBeenCalledWith(id, 'b'.repeat(64));
});
it('stop goes through trusted bounded service', async () => {
  await investigationAction({}, form('STOP'));
  expect(m.refresh).toHaveBeenCalledWith(id, false, true);
});
it('raw persistence detail never escapes', async () => {
  m.materialize.mockRejectedValue(new Error('sensitive fixture detail'));
  const state = await investigationAction({}, form('MATERIALIZE'));
  expect(state.error).not.toContain('sensitive fixture');
  expect(state.saved).toBeUndefined();
});
