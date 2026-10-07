'use server';
import { revalidatePath } from 'next/cache';
import {
  createInvestigationRepository,
  PersistenceError,
} from '@testpilot/database';
import { validateId, repeatabilityHypothesis } from '@testpilot/domain';
import { requireUser } from '../auth/server';
import { getTenantContext } from '../tenancy/context';
export interface InvestigationActionState {
  error?: string;
  saved?: boolean;
  investigationId?: string;
}
export async function investigationAction(
  _previous: InvestigationActionState,
  form: FormData,
): Promise<InvestigationActionState> {
  try {
    const { client } = await requireUser();
    const { workspace, project } = await getTenantContext();
    if (!workspace || !project) return { error: 'Select a project first.' };
    const repo = createInvestigationRepository(client);
    const mode = form.get('mode');
    let id: string;
    if (mode === 'DERIVE') {
      const run = validateId(form.get('runId'));
      const { data, error } = await client
        .from('execution_runs')
        .select('id')
        .eq('id', run)
        .eq('workspace_id', workspace.id)
        .eq('project_id', project.id)
        .maybeSingle();
      if (error || !data) return { error: 'Run unavailable.' };
      const finding = form.get('findingId');
      id = await repo.derive(
        run,
        typeof finding === 'string' && finding ? validateId(finding) : null,
      );
    } else {
      id = validateId(form.get('investigationId'));
      const context = await repo.context(id, workspace.id, project.id);
      if (mode === 'PROPOSE') {
        const rationale = form.get('rationale'),
          caseId = form.get('caseId'),
          evidence = form.getAll('evidenceItemId'),
          dependency = form.get('dependencyId');
        if (
          typeof rationale !== 'string' ||
          typeof caseId !== 'string' ||
          evidence.some((v) => typeof v !== 'string')
        )
          return { error: 'Invalid proposal.' };
        await repo.propose(context, {
          caseId,
          hypothesis: repeatabilityHypothesis,
          rationale,
          confidence: 'LOW',
          evidenceItemIds: evidence as string[],
          dependencyId:
            typeof dependency === 'string' && dependency
              ? validateId(dependency)
              : null,
          bindings: (() => {
            const choice = form.get('bindingChoice');
            if (typeof choice !== 'string' || choice === '') return [];
            if (!/^[0-9]+$/.test(choice)) throw Error('Invalid binding choice');
            const b = context.observedValues[Number(choice)];
            if (!b || b.caseId !== caseId) throw Error('Ineligible binding');
            return [
              {
                parameterPointer: b.parameterPointer,
                evidenceItemId: b.evidenceItemId,
                field: b.field,
              },
            ];
          })(),
        });
      } else if (
        mode === 'APPROVE' ||
        mode === 'REJECT' ||
        mode === 'MATERIALIZE'
      ) {
        const p = context.proposals.find(
          (p) => p.id === form.get('proposalId'),
        );
        if (!p) return { error: 'Proposal unavailable.' };
        // Never replace submitted stale values with freshly loaded authoritative values.
        const fp = form.get('fingerprint');
        if (typeof fp !== 'string') return { error: 'Invalid fingerprint.' };
        if (mode === 'MATERIALIZE') await repo.materialize(p.id, fp);
        else {
          const rev = form.get('revision');
          if (typeof rev !== 'string' || !/^\d+$/.test(rev))
            return { error: 'Invalid revision.' };
          await repo.decide(p.id, Number(rev), fp, mode === 'APPROVE');
        }
      } else if (['REFRESH', 'CONCLUDE', 'STOP'].includes(String(mode)))
        await repo.refresh(id, mode === 'CONCLUDE', mode === 'STOP');
      else return { error: 'Invalid action.' };
    }
    revalidatePath('/investigations');
    revalidatePath('/investigations/' + id);
    revalidatePath('/runs');
    revalidatePath('/findings');
    return { saved: true, investigationId: id };
  } catch (error) {
    return {
      error:
        error instanceof PersistenceError && error.kind === 'CONFLICT'
          ? 'Proposal changed. Reload and review again.'
          : 'Unable to save. Check permissions, evidence, approval and budget. Never include credentials.',
    };
  }
}
