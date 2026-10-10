import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  set: vi.fn(),
  remove: vi.fn(),
  member: vi.fn(),
  projects: vi.fn(),
  user: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: m.set, delete: m.remove }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock('../auth/server', () => ({ requireUser: m.user }));
vi.mock('@testpilot/database', async (original) => ({
  ...(await original<typeof import('@testpilot/database')>()),
  createTenantService: () => ({
    requireMembership: m.member,
    getWorkspaceProjects: m.projects,
  }),
}));
import { selectWorkspaceAction, selectProjectAction } from './actions';
const workspace = '16000000-0000-0000-0000-000000000001',
  project = '16000000-0000-0000-0000-000000000002';
beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.user.mockResolvedValue({ client: {} });
  m.member.mockResolvedValue(workspace);
  m.projects.mockResolvedValue([{ id: project }]);
});
function form() {
  const f = new FormData();
  f.set('workspace', workspace);
  f.set('project', project);
  return f;
}
it('workspace selection checks membership and clears previous project cookie', async () => {
  await expect(selectWorkspaceAction(form())).rejects.toThrow('REDIRECT:/');
  expect(m.member).toHaveBeenCalledWith(workspace);
  expect(m.remove).toHaveBeenCalledWith('tp-project');
  expect(m.set).toHaveBeenCalledWith(
    'tp-workspace',
    workspace,
    expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
  );
});
it('project selection verifies workspace projects and persists active context', async () => {
  await expect(selectProjectAction(form())).rejects.toThrow('REDIRECT:/');
  expect(m.projects).toHaveBeenCalledWith(workspace);
  expect(m.set).toHaveBeenCalledWith(
    'tp-project',
    project,
    expect.objectContaining({ httpOnly: true }),
  );
});
it('foreign project is rejected without changing context', async () => {
  m.projects.mockResolvedValue([]);
  await expect(selectProjectAction(form())).rejects.toThrow(
    'notice=unavailable',
  );
  expect(m.set).not.toHaveBeenCalled();
});
it('inaccessible workspace is rejected without changing context', async () => {
  m.member.mockRejectedValue(new Error('access'));
  await expect(selectWorkspaceAction(form())).rejects.toThrow(
    'notice=unavailable',
  );
  expect(m.set).not.toHaveBeenCalled();
  expect(m.remove).not.toHaveBeenCalled();
});
