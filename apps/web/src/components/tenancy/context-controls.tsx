import Link from 'next/link';
import type { Workspace, Project } from '@testpilot/domain';
import {
  selectProjectAction,
  selectWorkspaceAction,
} from '../../lib/tenancy/actions';
import { SubmitButton } from './submit-button';
export function ContextControls({
  workspaces,
  workspace,
  projects,
  project,
}: {
  workspaces: Workspace[];
  workspace: Workspace;
  projects: Project[];
  project: Project | undefined;
}) {
  return (
    <div className="space-y-4 text-xs">
      <form action={selectWorkspaceAction} className="space-y-2">
        <label className="form-label">
          Workspace
          <select
            name="workspace"
            className="form-input"
            defaultValue={workspace.id}
          >
            {workspaces.map((entry) => (
              <option value={entry.id} key={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton>Switch workspace</SubmitButton>
      </form>
      <p className="text-muted-foreground">Your role: {workspace.role}</p>
      {projects.length > 0 ? (
        <form action={selectProjectAction} className="space-y-2">
          <input name="workspace" type="hidden" value={workspace.id} />
          <label className="form-label">
            Project
            <select
              name="project"
              className="form-input"
              defaultValue={project?.id}
            >
              {projects.map((entry) => (
                <option value={entry.id} key={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton>Open project</SubmitButton>
        </form>
      ) : (
        <p className="text-muted-foreground">No projects yet.</p>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-2">
        <Link className="underline" href="/projects">
          All projects
        </Link>
        <Link className="underline" href="/workspaces/new">
          New workspace
        </Link>
      </div>
    </div>
  );
}
