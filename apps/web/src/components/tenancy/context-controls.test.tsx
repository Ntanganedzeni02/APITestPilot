import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
const m = vi.hoisted(() => ({ push: vi.fn(), pending: false }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  useFormStatus: () => ({ pending: m.pending }),
}));
vi.mock('../../lib/tenancy/actions', () => ({
  selectWorkspaceAction: vi.fn(),
  selectProjectAction: vi.fn(),
}));
import { ContextControls, ContextSelect } from './context-controls';
const workspace = { id: 'workspace-a', name: 'Ntanga', role: 'OWNER' as const };
const project = {
  id: 'project-a',
  workspace_id: workspace.id,
  name: 'Catalog',
  created_at: '',
  created_by: '',
  updated_at: '',
};
function markup(projects = [project], active = project) {
  return renderToStaticMarkup(
    <ContextControls
      workspaces={[workspace]}
      workspace={workspace}
      projects={projects}
      project={active}
    />,
  );
}
beforeEach(() => {
  m.push.mockReset();
  m.pending = false;
});
function choose(label: string, value: string, allPath?: string) {
  const element = ContextSelect({
    label,
    activeId: 'active',
    entries: [{ id: 'active', name: 'Active' }],
    createPath: label === 'Workspace' ? '/workspaces/new' : '/projects/new',
    allPath,
  });
  const children = element.props.children as ReactElement<{
    onChange: (event: unknown) => void;
  }>[];
  const select = children.find((child) => child?.type === 'select')!;
  const requestSubmit = vi.fn();
  select.props.onChange({ currentTarget: { value, form: { requestSubmit } } });
  return requestSubmit;
}
it('workspace changes submit immediately without a switch button', () => {
  expect(choose('Workspace', 'workspace-b')).toHaveBeenCalledOnce();
  expect(markup()).not.toContain('Switch workspace');
});
it('project changes submit immediately without an open button', () => {
  expect(choose('Project', 'project-b')).toHaveBeenCalledOnce();
  expect(markup()).not.toContain('Open project');
});
it('one workspace and project remain selectable with active marks and compact role', () => {
  const html = markup();
  expect(html).toContain('selected=""');
  expect(html).toContain('Catalog');
  expect(html).toContain('Workspace role: OWNER');
  expect(html).not.toContain('Your role:');
  expect(html).toContain('+ Create workspace');
  expect(html).toContain('+ Create project');
});
it('no projects has an actionable empty state and create option', () => {
  const html = markup([]);
  expect(html).toContain('No projects yet');
  expect(html).toContain('Create a project to start');
  expect(html).toContain('+ Create project');
});
it('foreign-workspace projects are never displayed or retained as active', () => {
  const foreign = {
    ...project,
    id: 'foreign',
    workspace_id: 'other',
    name: 'Other tenant',
  };
  const html = markup([foreign], foreign);
  expect(html).not.toContain('Other tenant');
  expect(html).toContain('No projects yet');
});
it('create workspace navigates without submitting a tenant mutation', () => {
  expect(choose('Workspace', '__create__')).not.toHaveBeenCalled();
  expect(m.push).toHaveBeenCalledWith('/workspaces/new');
});
it('create project and all projects remain accessible inside dropdown', () => {
  expect(choose('Project', '__create__', '/projects')).not.toHaveBeenCalled();
  expect(m.push).toHaveBeenCalledWith('/projects/new');
  choose('Project', '__all__', '/projects');
  expect(m.push).toHaveBeenCalledWith('/projects');
});
it('uses labelled native keyboard controls and disables pending submissions', () => {
  m.pending = true;
  const html = markup();
  expect(html).toContain('aria-label="Workspace"');
  expect(html).toContain('aria-label="Project"');
  expect(html).toContain('disabled=""');
  expect(html).toContain('truncate');
});
