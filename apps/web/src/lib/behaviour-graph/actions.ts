'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createApiKnowledgeRepository,
  createBehaviourGraphRepository,
  PersistenceError,
} from '@testpilot/database';
import { ValidationError } from '@testpilot/domain';
import { requireUser } from '../auth/server';
import { getTenantContext } from '../tenancy/context';
import { buildGraphForImport } from './build';
export interface GraphBuildState {
  error?: string;
}
export async function buildGraphAction(
  _previous: GraphBuildState,
  form: FormData,
): Promise<GraphBuildState> {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project)
    return { error: 'Select a project before building a graph.' };
  const importId = form.get('importId');
  if (typeof importId !== 'string') return { error: 'Select an API import.' };
  try {
    await buildGraphForImport(
      createApiKnowledgeRepository(client),
      createBehaviourGraphRepository(client),
      workspace.id,
      project.id,
      importId,
    );
  } catch (error) {
    return {
      error:
        error instanceof ValidationError || error instanceof PersistenceError
          ? error.message
          : 'Unable to build the graph. Please try again.',
    };
  }
  revalidatePath('/api-map');
  redirect(`/api-map?import=${importId}`);
}
