import { it, expect, beforeEach, vi } from 'vitest';
const m = vi.hoisted(() => ({
  context: vi.fn(),
  refresh: vi.fn(),
  assess: vi.fn(),
  current: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('./context', () => ({ intelligenceContext: m.context }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));
import { intelligenceAction } from './actions';
const id = '14000000-0000-0000-0000-000000000001';
const form = (mode = 'MEMORY') => {
  const f = new FormData();
  f.set('mode', mode);
  f.set('environmentId', id);
  return f;
};
beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.context.mockResolvedValue({
    workspace: { id },
    project: { id },
    environment: { id },
    repo: { refresh: m.refresh, assess: m.assess, current: m.current },
  });
  m.refresh.mockResolvedValue(1);
  m.assess.mockResolvedValue(id);
  m.current.mockResolvedValue({ current: null });
});
it('derives in selected project/environment only', async () => {
  expect(await intelligenceAction({}, form())).toHaveProperty('message');
  expect(m.refresh).toHaveBeenCalledWith(id, id);
});
it('requires selected tenant', async () => {
  m.context.mockResolvedValue(null);
  expect(await intelligenceAction({}, form())).toHaveProperty('error');
  expect(m.refresh).not.toHaveBeenCalled();
});
it('rejects invalid environment IDs before context', async () => {
  const f = form();
  f.set('environmentId', 'invalid');
  expect(await intelligenceAction({}, f)).toHaveProperty('error');
  expect(m.context).not.toHaveBeenCalled();
});
it('denied context never derives', async () => {
  m.context.mockRejectedValue(Error('private'));
  expect(await intelligenceAction({}, form())).toHaveProperty('error');
  expect(m.refresh).not.toHaveBeenCalled();
});
it('ignores forged scores, provenance and workspace from browser', async () => {
  const f = form('QUALITY');
  for (const key of [
    'score',
    'sourceId',
    'runId',
    'workspaceId',
    'scoringVersion',
  ])
    f.set(key, 'FORGED');
  await intelligenceAction({}, f);
  expect(m.assess).toHaveBeenCalledExactlyOnceWith(id, id);
});
it('assessment dedup communicates unchanged state', async () => {
  m.current.mockResolvedValue({ current: { id } });
  expect((await intelligenceAction({}, form('QUALITY'))).message).toContain(
    'remains current',
  );
});
it('empty refresh reports no duplicates', async () => {
  m.refresh.mockResolvedValue(0);
  expect((await intelligenceAction({}, form())).message).toContain(
    'No duplicate',
  );
});
it('unknown modes denied', async () => {
  expect(await intelligenceAction({}, form('AI_WRITE'))).toHaveProperty(
    'error',
  );
  expect(m.refresh).not.toHaveBeenCalled();
  expect(m.assess).not.toHaveBeenCalled();
});
it('internal errors never escape', async () => {
  m.refresh.mockRejectedValue(Error('private credential'));
  const r = await intelligenceAction({}, form());
  expect(r.error).not.toContain('credential');
  expect(m.revalidate).not.toHaveBeenCalled();
});
