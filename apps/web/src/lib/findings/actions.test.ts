import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  context: vi.fn(),
  derive: vi.fn(),
  detail: vi.fn(),
  review: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('../auth/server', () => ({ requireUser: m.requireUser }));
vi.mock('../tenancy/context', () => ({ getTenantContext: m.context }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));
vi.mock('@testpilot/database', async (original) => ({
  ...(await original<typeof import('@testpilot/database')>()),
  createFindingRepository: () => ({
    derive: m.derive,
    detail: m.detail,
    review: m.review,
  }),
}));
import { PersistenceError } from '@testpilot/database';
import { findingAction } from './actions';
const id = '14000000-0000-0000-0000-000000000001';
function form() {
  const f = new FormData();
  f.set('findingId', id);
  f.set('revision', '0');
  f.set('mode', 'CONFIRM');
  f.set('severity', 'HIGH');
  f.set('note', 'Human reviewed contract.');
  return f;
}
beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.requireUser.mockResolvedValue({ client: {} });
  m.context.mockResolvedValue({ workspace: { id }, project: { id } });
  m.detail.mockResolvedValue({});
  m.review.mockResolvedValue(id);
});
it('requires a selected tenant before any write', async () => {
  m.context.mockResolvedValue({});
  expect(await findingAction({}, form())).toEqual({
    error: 'Select a project first.',
  });
  expect(m.review).not.toHaveBeenCalled();
});
it('scopes the finding read to current tenant before review', async () => {
  expect(await findingAction({}, form())).toEqual({ saved: true });
  expect(m.detail).toHaveBeenCalledWith(id, id, id);
  expect(m.review).toHaveBeenCalledWith(
    id,
    0,
    'CONFIRM',
    'HIGH',
    'Human reviewed contract.',
  );
  expect(m.revalidate).toHaveBeenCalledWith('/findings/' + id);
});
it('cannot review a finding inaccessible to the selected tenant', async () => {
  m.detail.mockRejectedValue(new PersistenceError('ACCESS'));
  expect(await findingAction({}, form())).toHaveProperty('error');
  expect(m.review).not.toHaveBeenCalled();
});
it('stale review returns conflict and never success', async () => {
  m.review.mockRejectedValue(new PersistenceError('CONFLICT'));
  const result = await findingAction({}, form());
  expect(result.error).toContain('Reload before reviewing');
  expect(result.saved).toBeUndefined();
  expect(m.revalidate).not.toHaveBeenCalled();
});
it('invalid decision does not invoke review', async () => {
  const f = form();
  f.set('mode', 'AUTO_CONFIRM');
  expect(await findingAction({}, f)).toEqual({ error: 'Invalid review.' });
  expect(m.review).not.toHaveBeenCalled();
});
it('database exception details never escape to the browser', async () => {
  m.review.mockRejectedValue(new Error('private fixture credentials'));
  const result = await findingAction({}, form());
  expect(result.error).not.toContain('private fixture');
  expect(result.saved).toBeUndefined();
});

it.each(['', '-1', '0.5'])(
  'rejects invalid revision input %s before a scoped read or write',
  async (revision) => {
    const f = form();
    f.set('revision', revision);
    expect(await findingAction({}, f)).toEqual({ error: 'Invalid review.' });
    expect(m.detail).not.toHaveBeenCalled();
    expect(m.review).not.toHaveBeenCalled();
  },
);
