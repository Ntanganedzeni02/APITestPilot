'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createApiKnowledgeRepository,
  PersistenceError,
} from '@testpilot/database';
import { SpecError } from '@testpilot/api-spec';
import { requireUser } from '../auth/server';
import { getTenantContext } from '../tenancy/context';
import { importSpecification } from './import';

export interface ImportState {
  error?: string;
  code?: string;
  pointer?: string;
}
export async function importApiAction(
  _previous: ImportState,
  form: FormData,
): Promise<ImportState> {
  // Authentication redirects remain outside the error handler.
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project)
    return { error: 'Select a project before importing.' };
  let id: string;
  try {
    id = await importSpecification(
      createApiKnowledgeRepository(client),
      workspace.id,
      project.id,
      form,
    );
  } catch (error) {
    if (error instanceof SpecError)
      return { error: error.message, code: error.code, pointer: error.pointer };
    return {
      error:
        error instanceof PersistenceError
          ? error.message
          : 'Unable to import this specification. Please try again.',
    };
  }
  revalidatePath('/api-map');
  redirect(`/api-map?import=${id}`);
}
