'use server';
import { revalidatePath } from 'next/cache';
import { createFindingRepository, PersistenceError } from '@testpilot/database';
import {
  validateId,
  findingSeverities,
  type FindingSeverity,
} from '@testpilot/domain';
import { requireUser } from '../auth/server';
import { getTenantContext } from '../tenancy/context';
export interface FindingActionState {
  error?: string;
  saved?: boolean;
}
export async function findingAction(
  _previous: FindingActionState,
  form: FormData,
): Promise<FindingActionState> {
  try {
    const { client } = await requireUser();
    const { workspace, project } = await getTenantContext();
    if (!workspace || !project) return { error: 'Select a project first.' };
    const repo = createFindingRepository(client),
      mode = form.get('mode');
    if (mode === 'DERIVE') {
      const run = validateId(String(form.get('runId')));
      const q = await client
        .from('execution_runs')
        .select('id')
        .eq('id', run)
        .eq('workspace_id', workspace.id)
        .eq('project_id', project.id)
        .maybeSingle();
      if (q.error || !q.data) return { error: 'Run unavailable.' };
      await repo.derive(run);
    } else {
      const id = validateId(String(form.get('findingId'))),
        severity = form.get('severity'),
        revisionValue = form.get('revision'),
        revision = Number(revisionValue),
        note = form.get('note');
      if (
        typeof revisionValue !== 'string' ||
        !/^[0-9]+$/.test(revisionValue) ||
        !Number.isSafeInteger(revision) ||
        !['CONFIRM', 'DISMISS'].includes(String(mode)) ||
        typeof severity !== 'string' ||
        !(findingSeverities as readonly string[]).includes(severity) ||
        typeof note !== 'string'
      )
        return { error: 'Invalid review.' };
      await repo.detail(workspace.id, project.id, id);
      await repo.review(
        id,
        revision,
        mode as 'CONFIRM' | 'DISMISS',
        severity as FindingSeverity,
        note,
      );
      revalidatePath('/findings/' + id);
    }
    revalidatePath('/findings');
    revalidatePath('/runs');
    return { saved: true };
  } catch (error) {
    return {
      error:
        error instanceof PersistenceError && error.kind === 'CONFLICT'
          ? 'This finding was already reviewed or changed. Reload before reviewing.'
          : 'Unable to save. Check permissions and input; do not include credentials in notes.',
    };
  }
}
