'use client';
import { useActionState } from 'react';
import {
  createWorkspaceAction,
  createProjectAction,
} from '../../lib/tenancy/actions';
import type { FormState } from '../../lib/auth/validation';
import { Button } from '../ui/button';
export function TenantForm({ workspace }: { workspace?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    workspace ? createProjectAction : createWorkspaceAction,
    {},
  );
  return (
    <form
      action={action}
      className="mt-7 max-w-lg space-y-5"
      aria-busy={pending}
    >
      {workspace && <input type="hidden" name="workspace" value={workspace} />}
      <label className="form-label">
        {workspace ? 'Project name' : 'Workspace name'}
        <input
          className="form-input"
          name="name"
          required
          minLength={2}
          maxLength={80}
          autoComplete="off"
          disabled={pending}
          aria-describedby="name-help"
        />
      </label>
      <p id="name-help" className="text-xs text-muted-foreground">
        Use 2–80 characters. Names can repeat; each{' '}
        {workspace ? 'project' : 'workspace'} has a unique identity.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button disabled={pending}>
        {pending
          ? 'Creating…'
          : workspace
            ? 'Create project'
            : 'Create workspace'}
      </Button>
    </form>
  );
}
