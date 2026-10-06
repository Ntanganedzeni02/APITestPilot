import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createTenantService } from '@testpilot/database';
import { requireUser } from '../auth/server';

export const getTenantContext = cache(async () => {
  const { client, user } = await requireUser();
  const service = createTenantService(client);
  const workspaces = await service.getUserWorkspaces();
  const jar = await cookies();
  const workspaceId = jar.get('tp-workspace')?.value;
  const workspace = workspaceId
    ? workspaces.find((entry) => entry.id === workspaceId)
    : workspaces[0];
  if (workspaceId && !workspace) notFound();
  const projects = workspace
    ? await service.getWorkspaceProjects(workspace.id)
    : [];
  const projectId = jar.get('tp-project')?.value;
  const project = projectId
    ? projects.find((entry) => entry.id === projectId)
    : projects[0];
  if (projectId && !project) notFound();
  return { user, service, workspaces, workspace, projects, project };
});
