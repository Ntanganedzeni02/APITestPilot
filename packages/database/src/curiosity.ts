import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateId,
  validateCuriosityProposal,
  investigationStatuses,
  type Investigation,
  type CuriosityContext,
  type InvestigationProposal,
} from '@testpilot/domain';
import { PersistenceError } from './index.js';
export function createInvestigationRepository(client: SupabaseClient) {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error)
      throw new PersistenceError(
        error.code === '42501'
          ? 'ACCESS'
          : error.code === '40001'
            ? 'CONFLICT'
            : 'DATABASE',
      );
    return data;
  }
  return {
    async list(
      workspace: string,
      project: string,
      page = 0,
      status?: string,
    ): Promise<Investigation[]> {
      if (
        !Number.isSafeInteger(page) ||
        page < 0 ||
        page > 10000 ||
        (status &&
          !(investigationStatuses as readonly string[]).includes(status))
      )
        throw new PersistenceError('DATABASE');
      let q = client
        .from('investigations')
        .select('*')
        .eq('workspace_id', validateId(workspace))
        .eq('project_id', validateId(project));
      if (status) q = q.eq('status', status);
      const { data, error } = await q
        .order('created_at', { ascending: false })
        .order('id')
        .range(page * 25, page * 25 + 24);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      const rows = data as Investigation[];
      if (!rows.length) return rows;
      const [steps, audits] = await Promise.all([
        client
          .from('investigation_proposals')
          .select('investigation_id,status,run_id')
          .eq('workspace_id', workspace)
          .eq('project_id', project)
          .in(
            'investigation_id',
            rows.map((r) => r.id),
          )
          .limit(200),
        client
          .from('investigation_audit_events')
          .select('investigation_id,created_at')
          .eq('workspace_id', workspace)
          .eq('project_id', project)
          .in(
            'investigation_id',
            rows.map((r) => r.id),
          )
          .order('created_at', { ascending: false })
          .limit(1000),
      ]);
      if (
        steps.error ||
        audits.error ||
        !Array.isArray(steps.data) ||
        !Array.isArray(audits.data)
      )
        throw new PersistenceError('DATABASE');
      return rows.map((r) => ({
        ...r,
        proposalCount: steps.data.filter((s) => s.investigation_id === r.id)
          .length,
        executedStepCount: steps.data.filter(
          (s) => s.investigation_id === r.id && s.status === 'EXECUTED',
        ).length,
        latestActivity:
          audits.data.find((a) => a.investigation_id === r.id)?.created_at ??
          r.created_at,
      }));
    },
    async derive(run: string, finding: string | null = null) {
      return validateId(
        await rpc('derive_investigation', {
          run_input: validateId(run),
          finding_input: finding ? validateId(finding) : null,
        }),
      );
    },
    async context(
      id: string,
      workspace: string,
      project: string,
    ): Promise<CuriosityContext> {
      const data = (await rpc('investigation_context', {
        investigation_input: validateId(id),
      })) as CuriosityContext;
      if (
        !data?.investigation ||
        data.investigation.workspace_id !== validateId(workspace) ||
        data.investigation.project_id !== validateId(project) ||
        !Array.isArray(data.cases) ||
        !Array.isArray(data.evidence) ||
        !Array.isArray(data.proposals) ||
        !Array.isArray(data.observedValues)
      )
        throw new PersistenceError('ACCESS');
      return data;
    },
    async propose(context: CuriosityContext, p: InvestigationProposal) {
      const payload = validateCuriosityProposal(p, context);
      return validateId(
        await rpc('persist_investigation_proposal', {
          investigation_input: context.investigation.id,
          payload_input: payload,
        }),
      );
    },
    async decide(
      id: string,
      revision: number,
      fingerprint: string,
      approve: boolean,
    ) {
      if (
        !Number.isSafeInteger(revision) ||
        revision < 0 ||
        !/^[a-f0-9]{64}$/.test(fingerprint) ||
        typeof approve !== 'boolean'
      )
        throw new PersistenceError('DATABASE');
      return validateId(
        await rpc('decide_investigation_proposal', {
          proposal_input: validateId(id),
          revision_input: revision,
          fingerprint_input: fingerprint,
          approve_input: approve,
        }),
      );
    },
    async materialize(id: string, fingerprint: string) {
      if (!/^[a-f0-9]{64}$/.test(fingerprint))
        throw new PersistenceError('DATABASE');
      return validateId(
        await rpc('materialize_investigation_proposal', {
          proposal_input: validateId(id),
          fingerprint_input: fingerprint,
        }),
      );
    },
    async refresh(id: string, conclude = false, stop = false) {
      return validateId(
        await rpc('refresh_investigation', {
          investigation_input: validateId(id),
          conclude_input: conclude,
          stop_input: stop,
        }),
      );
    },
  };
}
