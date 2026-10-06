'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createTenantService, PersistenceError } from '@testpilot/database';
import { ValidationError, validateId, validateName } from '@testpilot/domain';
import { requireUser } from '../auth/server';
import type { FormState } from '../auth/validation';

async function setContext(workspace: string, project?: string) {
  const jar = await cookies();
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
  jar.set('tp-workspace', workspace, options);
  if (project) jar.set('tp-project', project, options);
  else jar.delete('tp-project');
}
function safeError(error: unknown): FormState {
  return {
    error:
      error instanceof ValidationError || error instanceof PersistenceError
        ? error.message
        : 'Unable to save your changes. Please try again.',
  };
}
export async function createWorkspaceAction(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { client } = await requireUser();
  let id;
  try {
    id = await createTenantService(client).createWorkspace(
      validateName(form.get('name')),
    );
    await setContext(id);
  } catch (error) {
    return safeError(error);
  }
  redirect('/projects/new');
}
export async function createProjectAction(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { client } = await requireUser();
  try {
    const workspace = validateId(form.get('workspace'));
    const project = await createTenantService(client).createProject(
      workspace,
      validateName(form.get('name')),
    );
    await setContext(workspace, project);
  } catch (error) {
    return safeError(error);
  }
  redirect('/');
}
export async function selectWorkspaceAction(form: FormData) {
  const { client } = await requireUser();
  try {
    const workspace = await createTenantService(client).requireMembership(
      validateId(form.get('workspace')),
    );
    await setContext(workspace);
  } catch {
    redirect('/projects?notice=unavailable');
  }
  redirect('/');
}
export async function selectProjectAction(form: FormData) {
  const { client } = await requireUser();
  try {
    const workspace = validateId(form.get('workspace'));
    const project = validateId(form.get('project'));
    const projects =
      await createTenantService(client).getWorkspaceProjects(workspace);
    if (!projects.some((entry) => entry.id === project))
      throw new PersistenceError('ACCESS');
    await setContext(workspace, project);
  } catch {
    redirect('/projects?notice=unavailable');
  }
  redirect('/');
}
export async function clearContextAction() {
  await requireUser();
  const jar = await cookies();
  jar.delete('tp-workspace');
  jar.delete('tp-project');
  redirect('/onboarding');
}
