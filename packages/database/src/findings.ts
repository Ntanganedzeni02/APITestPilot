import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateId,
  validateFindingReview,
  findingStatuses,
  findingSeverities,
  findingConfidences,
  type EvidencePackage,
  type EvidenceItem,
  type Finding,
  type FindingOccurrence,
  type FindingReview,
  type ExecutionRun,
} from '@testpilot/domain';
import { PersistenceError } from './index.js';
function rows<T>(value: unknown): T[] {
  if (
    !Array.isArray(value) ||
    value.some((v) => !v || typeof v !== 'object' || Array.isArray(v))
  )
    throw new PersistenceError('DATABASE');
  for (const row of value as Record<string, unknown>[])
    for (const key of ['id', 'workspace_id', 'project_id'])
      if (key in row) validateId(String(row[key]));
  return value as T[];
}
export function decodeFinding(value: unknown): Finding {
  const f = rows<Finding>([value])[0]!;
  if (
    !findingStatuses.includes(f.status) ||
    !findingSeverities.includes(f.severity) ||
    !findingConfidences.includes(f.confidence) ||
    f.source !== 'DETERMINISTIC' ||
    !['ASSERTION_FAILED', 'EXECUTION_TIMEOUT', 'TRANSPORT_FAILURE'].includes(
      f.rule,
    ) ||
    !Number.isSafeInteger(f.revision) ||
    !Number.isSafeInteger(f.occurrence_count) ||
    f.occurrence_count < 1 ||
    typeof f.title !== 'string' ||
    f.title.length > 160 ||
    typeof f.summary !== 'string' ||
    f.summary.length > 2000 ||
    !/^[a-f0-9]{64}$/.test(f.fingerprint)
  )
    throw new PersistenceError('DATABASE');
  return f;
}
export interface FindingDetail {
  finding: Finding;
  occurrences: FindingOccurrence[];
  packages: EvidencePackage[];
  items: EvidenceItem[];
  reviews: FindingReview[];
  runs: ExecutionRun[];
  traceability: { qa_item_id: string; qa_kind: string; plan_id: string }[];
}
export function createFindingRepository(client: SupabaseClient) {
  async function read<T>(
    table: string,
    workspace: string,
    project: string,
    column?: string,
    ids?: string[],
  ) {
    let q = client
      .from(table)
      .select('*')
      .eq('workspace_id', validateId(workspace))
      .eq('project_id', validateId(project));
    if (column && ids) {
      if (!ids.length) return [];
      q = q.in(column, ids.map(validateId));
    }
    const all: T[] = [];
    for (let offset = 0; offset < 2000; offset += 500) {
      const { data, error } = await q.order('id').range(offset, offset + 499);
      if (error) throw new PersistenceError('DATABASE');
      const batch = rows<T>(data);
      all.push(...batch);
      if (batch.length < 500) return all;
    }
    throw new PersistenceError('DATABASE');
  }
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
    return validateId(data);
  }
  return {
    async list(workspace: string, project: string, page = 0, status?: string) {
      if (
        !Number.isSafeInteger(page) ||
        page < 0 ||
        page > 10000 ||
        (status && !(findingStatuses as readonly string[]).includes(status))
      )
        throw new PersistenceError('DATABASE');
      let q = client
        .from('findings')
        .select('*')
        .eq('workspace_id', validateId(workspace))
        .eq('project_id', validateId(project));
      if (status) q = q.eq('status', status);
      const { data, error } = await q
        .order('last_observed_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * 25, page * 25 + 24);
      if (error) throw new PersistenceError('DATABASE');
      const findings = rows<unknown>(data).map(decodeFinding);
      const packages = await read<EvidencePackage>(
        'evidence_packages',
        workspace,
        project,
        'id',
        findings.map((f) => f.first_package_id),
      );
      const runs = await read<ExecutionRun>(
        'execution_runs',
        workspace,
        project,
        'id',
        packages.map((p) => p.run_id),
      );
      return findings.map((f) => {
        const p = packages.find((p) => p.id === f.first_package_id),
          r = runs.find((r) => r.id === p?.run_id);
        return r?.request
          ? {
              ...f,
              operation: {
                method: r.request.method,
                pointer: r.request.operationPointer,
              },
            }
          : f;
      });
    },
    async runLinks(workspace: string, project: string, runIds: string[]) {
      const packages = await read<EvidencePackage>(
        'evidence_packages',
        workspace,
        project,
        'run_id',
        runIds,
      );
      const occurrences = await read<FindingOccurrence>(
        'finding_occurrences',
        workspace,
        project,
        'package_id',
        packages.map((p) => p.id),
      );
      const findings = await read<Finding>(
        'findings',
        workspace,
        project,
        'id',
        [...new Set(occurrences.map((o) => o.finding_id))],
      );
      return packages.map((p) => ({
        runId: p.run_id,
        packageId: p.id,
        findings: findings
          .filter((f) =>
            occurrences.some(
              (o) => o.package_id === p.id && o.finding_id === f.id,
            ),
          )
          .map(decodeFinding),
      }));
    },
    async detail(
      workspace: string,
      project: string,
      id: string,
      occurrencePage = 0,
    ): Promise<FindingDetail> {
      if (
        !Number.isSafeInteger(occurrencePage) ||
        occurrencePage < 0 ||
        occurrencePage > 10000
      )
        throw new PersistenceError('DATABASE');
      const found = await read<unknown>('findings', workspace, project, 'id', [
        id,
      ]);
      if (!found.length) throw new PersistenceError('ACCESS');
      const finding = decodeFinding(found[0]);
      const response = await client
        .from('finding_occurrences')
        .select('*')
        .eq('workspace_id', validateId(workspace))
        .eq('project_id', validateId(project))
        .eq('finding_id', finding.id)
        .order('observed_at', { ascending: false })
        .order('id', { ascending: false })
        .range(occurrencePage * 20, occurrencePage * 20 + 19);
      if (response.error) throw new PersistenceError('DATABASE');
      const occurrences = rows<FindingOccurrence>(response.data);
      const packages = await read<EvidencePackage>(
        'evidence_packages',
        workspace,
        project,
        'id',
        occurrences.map((o) => o.package_id),
      );
      const [items, reviews, runs, saved] = await Promise.all([
        read<EvidenceItem>(
          'evidence_items',
          workspace,
          project,
          'package_id',
          packages.map((p) => p.id),
        ),
        read<FindingReview>(
          'finding_reviews',
          workspace,
          project,
          'finding_id',
          [id],
        ),
        read<ExecutionRun>(
          'execution_runs',
          workspace,
          project,
          'id',
          packages.map((p) => p.run_id),
        ),
        (async () => {
          const q = await client
            .from('execution_results')
            .select('run_id,result')
            .eq('workspace_id', validateId(workspace))
            .in(
              'run_id',
              packages.map((p) => p.run_id),
            );
          if (q.error) throw new PersistenceError('DATABASE');
          return rows<{ run_id: string; result: ExecutionRun['result'] }>(
            q.data,
          );
        })(),
      ]);
      const links = await client
        .from('test_item_qa_links')
        .select('qa_item_id,qa_kind,plan_id')
        .eq('workspace_id', validateId(workspace))
        .eq('item_id', finding.case_id);
      if (links.error) throw new PersistenceError('DATABASE');
      return {
        finding,
        occurrences,
        packages,
        items,
        reviews: reviews.sort((a, b) => a.revision - b.revision),
        runs: runs.map((r) => ({
          ...r,
          result: saved.find((v) => v.run_id === r.id)?.result ?? null,
        })),
        traceability: rows(links.data),
      };
    },
    derive(runId: string) {
      return rpc('derive_execution_evidence', { run_input: validateId(runId) });
    },
    review(
      id: string,
      revision: number,
      decision: 'CONFIRM' | 'DISMISS',
      severity: Finding['severity'],
      note: string,
    ) {
      validateFindingReview(id, revision, decision, severity, note);
      return rpc('review_finding', {
        finding_input: id,
        revision_input: revision,
        decision_input: decision,
        severity_input: severity,
        note_input: note,
      });
    },
  };
}
