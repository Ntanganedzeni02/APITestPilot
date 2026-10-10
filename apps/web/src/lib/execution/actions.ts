'use server';
import { revalidatePath } from 'next/cache';
import {
  createExecutionRepository,
  createTenantService,
  ExecutionPersistenceError,
  PersistenceError,
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
  errorCode?: string;
}
export async function executionAction(
  _previous: ExecutionActionState,
  form: FormData,
): Promise<ExecutionActionState> {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project) return { error: 'Select a project first.' };
  let stage:
    | 'ACTION'
    | 'ENVIRONMENT_SCOPE'
    | 'TARGET_VALIDATION'
    | 'TARGET_SAVE'
    | 'REVALIDATION' = 'ACTION';
  try {
    const id = (key: string) => validateId(form.get(key));
    const mode = form.get('mode');
    if ((mode === 'REQUEST' || mode === 'APPROVE') && !executionAvailable())
      return {
        error: executionUnavailableMessage,
        errorCode: 'EXECUTION_UNAVAILABLE',
      };
    const repo = createExecutionRepository(client);
    if (mode === 'CONFIGURE') {
      if (!['OWNER', 'ADMIN'].includes(workspace.role))
        return {
          error:
            'Only workspace owners and administrators can configure execution targets.',
          errorCode: 'ACCESS',
        };
      const environment = id('environmentId');
      stage = 'ENVIRONMENT_SCOPE';
      const environments = await createTenantService(
        client,
      ).getProjectEnvironments(workspace.id, project.id);
      if (!environments.some((e) => e.id === environment))
        throw new ValidationError('Environment unavailable.');
      const raw = form.get('baseUrl');
      stage = 'TARGET_VALIDATION';
      if (typeof raw !== 'string' || raw.length > 2048)
        throw new ValidationError('Invalid target.');
      let url: URL;
      let port: number;
      try {
        url = new URL(raw);
        port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
        validateTarget(raw, port);
      } catch {
        throw new ValidationError(
          'Enter a valid public HTTP or HTTPS base URL without credentials, query strings, fragments or whitespace. Localhost and unsafe ports are not allowed.',
        );
      }
      const host = url.hostname.replace(/^\[|\]$/g, '');
      if (
        (host.includes(':') || /^\d+(\.\d+){3}$/.test(host)) &&
        !publicAddress(host)
      )
        throw new ValidationError('Private/internal targets are blocked.');
      stage = 'TARGET_SAVE';
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
    stage = 'REVALIDATION';
    revalidatePath('/runs');
    return { saved: true };
  } catch (error) {
    if (error instanceof ExecutionPersistenceError) {
      const messages = {
        ACCESS:
          'You do not have permission to perform this execution action. Check your project access and role.',
        ELIGIBILITY:
          'This execution action is no longer eligible. Check current case and scenario reviews, approved requirements, and the selected project environment.',
        CONFIGURATION:
          'The selected environment or execution target is unavailable, disabled or rejected. Check project environment configuration and the public HTTPS target.',
        SCHEMA:
          'Execution database functions are unavailable. Ask an administrator to verify deployed migrations and the Data API schema cache.',
        CONFLICT:
          'Execution state changed. Reload Runs before submitting again.',
        DATABASE:
          'The execution action could not be saved because the database is unavailable or rejected the operation. No successful execution is confirmed.',
      };
      console.warn('EXECUTION_ACTION_REJECTED', {
        category: error.reason,
        stage,
      });
      return { error: messages[error.reason], errorCode: error.reason };
    }
    if (error instanceof PersistenceError)
      return { error: error.message, errorCode: error.kind };
    if (!(error instanceof ValidationError))
      console.warn('EXECUTION_ACTION_FAILED', { category: 'SERVER', stage });
    return {
      error:
        error instanceof ValidationError
          ? error.message
          : 'An unexpected server error prevented saving this action. No successful execution is confirmed. Ask an administrator to inspect server diagnostics.',
      errorCode: error instanceof ValidationError ? 'VALIDATION' : 'SERVER',
    };
  }
}
