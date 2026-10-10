'use client';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import type { Workspace, Project } from '@testpilot/domain';
import {
  selectProjectAction,
  selectWorkspaceAction,
} from '../../lib/tenancy/actions';
export function ContextSelect({
  label,
  activeId,
  entries,
  createPath,
  allPath,
  workspaceRole,
}: {
  label: string;
  activeId?: string | undefined;
  entries: { id: string; name: string }[];
  createPath: string;
  allPath?: string | undefined;
  workspaceRole?: string;
}) {
  const router = useRouter();
  const { pending } = useFormStatus();
  return (
    <label className="form-label min-w-0">
      <span className="flex items-center justify-between gap-2">
        {label}
        {workspaceRole && (
          <span
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
            aria-label={`Workspace role: ${workspaceRole}`}
          >
            {workspaceRole}
          </span>
        )}
      </span>
      <select
        key={activeId ?? 'empty'}
        name={label.toLowerCase()}
        aria-label={label}
        disabled={pending}
        defaultValue={activeId ?? ''}
        className="form-input w-full min-w-0 truncate disabled:opacity-60"
        title={entries.find((entry) => entry.id === activeId)?.name}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === '__create__') router.push(createPath);
          else if (value === '__all__' && allPath) router.push(allPath);
          else if (value) event.currentTarget.form?.requestSubmit();
        }}
      >
        {!activeId && (
          <option value="" disabled>
            {entries.length
              ? `Select ${label.toLowerCase()}`
              : `No ${label.toLowerCase()}s yet`}
          </option>
        )}
        {entries.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.id === activeId ? '✓ ' : ''}
            {entry.name}
          </option>
        ))}
        {allPath && <option value="__all__">All projects</option>}
        <option value="__create__">+ Create {label.toLowerCase()}</option>
      </select>
    </label>
  );
}
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
  const scopedProjects = projects.filter(
    (entry) => entry.workspace_id === workspace.id,
  );
  const activeProject = scopedProjects.find(
    (entry) => entry.id === project?.id,
  );
  return (
    <div className="space-y-3 text-xs">
      <form action={selectWorkspaceAction}>
        <ContextSelect
          workspaceRole={workspace.role}
          label="Workspace"
          activeId={workspace.id}
          entries={workspaces}
          createPath="/workspaces/new"
        />
      </form>
      <form key={workspace.id} action={selectProjectAction}>
        <input name="workspace" type="hidden" value={workspace.id} />
        <ContextSelect
          label="Project"
          activeId={activeProject?.id}
          entries={scopedProjects}
          createPath="/projects/new"
          allPath="/projects"
        />
      </form>
      {!scopedProjects.length && (
        <p className="text-muted-foreground">
          Create a project to start this workspace.
        </p>
      )}
    </div>
  );
}
