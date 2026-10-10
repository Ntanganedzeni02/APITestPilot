'use server';
import { revalidatePath } from 'next/cache';
import {
  createExecutionRepository,
  createTenantService,
} from '@testpilot/database';
import { validateId, ValidationError } from '@testpilot/domain';
import { validateTarget, publicAddress } from '@testpilot/safety';
import { requireUser } from '../auth/server';
import { getTenantContext } from '../tenancy/context';
import {
  executionAvailable,
  executionUnavailableMessage,
} from './availability';
export interface ExecutionActionState {
  error?: string;
  saved?: boolean;
}
export async function executionAction(
  _previous: ExecutionActionState,
  form: FormData,
): Promise<ExecutionActionState> {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project) return { error: 'Select a project first.' };
  try {
    const repo = createExecutionRepository(client);
    const id = (key: string) => validateId(form.get(key));
    const mode = form.get('mode');
    if ((mode === 'REQUEST' || mode === 'APPROVE') && !executionAvailable())
      return { error: executionUnavailableMessage };
    if (mode === 'CONFIGURE') {
      const environment = id('environmentId');
      const environments = await createTenantService(
        client,
      ).getProjectEnvironments(workspace.id, project.id);
      if (!environments.some((e) => e.id === environment))
        throw new ValidationError('Environment unavailable.');
      const raw = form.get('baseUrl');
      if (typeof raw !== 'string' || raw.length > 2048)
        throw new ValidationError('Invalid target.');
      const url = new URL(raw);
      const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
      validateTarget(raw, port);
      const host = url.hostname.replace(/^\[|\]$/g, '');
      if (
        (host.includes(':') || /^\d+(\.\d+){3}$/.test(host)) &&
        !publicAddress(host)
      )
        throw new ValidationError('Private/internal targets are blocked.');
      await repo.configure(
        environment,
        url.toString(),
        port,
        form.get('enabled') === 'on',
      );
    } else if (mode === 'REQUEST') {
      await repo.request(id('caseId'), id('environmentId'));
    } else {
      const runId = id('runId');
      if (
        !(await repo.list(workspace.id, project.id)).some((r) => r.id === runId)
      )
        throw new ValidationError('Run unavailable.');
      if (mode === 'CANCEL') await repo.cancel(runId);
      else if (mode === 'APPROVE' || mode === 'REJECT') {
        const fingerprint = form.get('fingerprint');
        if (
          typeof fingerprint !== 'string' ||
          !/^[a-f0-9]{64}$/.test(fingerprint)
        )
          throw new ValidationError('Invalid request binding.');
        await repo.approve(runId, fingerprint, mode === 'APPROVE');
      } else throw new ValidationError('Unknown action.');
    }
    revalidatePath('/runs');
    return { saved: true };
  } catch (error) {
    return {
      error:
        error instanceof ValidationError
          ? error.message
          : 'Unable to save execution request. Check configuration, eligibility and permissions.',
    };
  }
}
