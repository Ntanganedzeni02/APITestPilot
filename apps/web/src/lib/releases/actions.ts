'use server';
import { revalidatePath } from 'next/cache';
import { canManageReleases, validateId } from '@testpilot/domain';
import { releaseContext } from './context';
export interface ReleaseActionState {
  error?: string;
  message?: string;
  href?: string;
}
export async function releaseAction(
  _previous: ReleaseActionState,
  form: FormData,
): Promise<ReleaseActionState> {
  try {
    const c = await releaseContext(validateId(form.get('environmentId')));
    if (!c || !canManageReleases(c.workspace.role))
      return { error: 'OWNER or ADMIN release authority required.' };
    const mode = form.get('mode');
    let id: string;
    let href: string;
    if (mode === 'CREATE') {
      id = await c.repo.create(
        c.project.id,
        c.environment.id,
        String(form.get('name') ?? ''),
      );
      href = '/releases/' + id;
    } else {
      const releaseId = validateId(form.get('releaseId'));
      const detail = await c.repo.detail(
        c.workspace.id,
        c.project.id,
        releaseId,
      );
      if (!detail || detail.release.environment_id !== c.environment.id)
        return { error: 'Release unavailable.' };
      if (mode === 'ASSESS') {
        id = await c.repo.assess(releaseId);
        href = '/releases/' + releaseId;
      } else if (mode === 'DECIDE') {
        id = await c.repo.decide(
          releaseId,
          validateId(form.get('assessmentId')),
          form.get('expectedDecision')
            ? validateId(form.get('expectedDecision'))
            : null,
          String(form.get('decision')),
          String(form.get('rationale') ?? ''),
        );
        href = '/releases/' + releaseId;
      } else if (mode === 'REPORT') {
        id = await c.repo.generate(
          releaseId,
          validateId(form.get('assessmentId')),
        );
        href = '/reports/' + id;
      } else return { error: 'Invalid release action.' };
    }
    for (const path of ['/releases', '/reports', '/']) revalidatePath(path);
    return { message: 'Request completed from persisted state.', href };
  } catch {
    return {
      error:
        'Unable to complete request. Refresh the release and check authority, current evidence, scope and safe rationale.',
    };
  }
}
