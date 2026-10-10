import 'server-only';
import { notFound } from 'next/navigation';
import { createMemoryQualityRepository } from '@testpilot/database';
import { getTenantContext } from '../tenancy/context';
import { requireUser } from '../auth/server';
export async function intelligenceContext(environment?: string) {
  const context = await getTenantContext();
  if (!context.workspace || !context.project) return null;
  const environments = await context.service.getProjectEnvironments(
    context.workspace.id,
    context.project.id,
  );
  const selected = environment
    ? environments.find((e) => e.id === environment)
    : (environments.find((e) => e.type === 'DEVELOPMENT') ?? environments[0]);
  if (!selected) notFound();
  const { client } = await requireUser();
  return {
    ...context,
    workspace: context.workspace,
    project: context.project,
    environments,
    environment: selected,
    repo: createMemoryQualityRepository(client),
  };
}
