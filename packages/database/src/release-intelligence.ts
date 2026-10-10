import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assessRelease,
  validateId,
  validateReleaseText,
  releaseDecisions,
  releasePolicyVersion,
  releaseReportVersion,
  type Release,
  type ReleaseAssessment,
  type ReleaseDecision,
  type ReleaseReport,
} from '@testpilot/domain';
import { PersistenceError } from './index.js';
import { decodeQualityAssessment } from './memory-quality.js';
function ids(row: {
  workspace_id: string;
  project_id: string;
  environment_id: string;
  api_import_id: string;
  id: string;
}) {
  for (const id of [
    row.id,
    row.workspace_id,
    row.project_id,
    row.environment_id,
    row.api_import_id,
  ])
    validateId(id);
}
export function decodeRelease(row: Release): Release {
  ids(row);
  validateReleaseText(row.name, 120);
  validateId(row.created_by);
  if (row.assessment_id) validateId(row.assessment_id);
  if (row.decision_id) validateId(row.decision_id);
  return row;
}
export function decodeReleaseAssessment(
  row: ReleaseAssessment,
): ReleaseAssessment {
  try {
    ids(row);
    validateId(row.release_id);
    validateId(row.created_by);
    if (
      row.policy_version !== releasePolicyVersion ||
      !/^[a-f0-9]{64}$/.test(row.fingerprint)
    )
      throw Error();
    const q = row.result.inputs.quality;
    if (q) {
      decodeQualityAssessment(q);
      if (
        q.workspace_id !== row.workspace_id ||
        q.project_id !== row.project_id ||
        q.environment_id !== row.environment_id ||
        q.api_import_id !== row.api_import_id ||
        q.id !== row.quality_assessment_id ||
        !row.result.inputs.sourceCurrent
      )
        throw Error();
    } else if (row.quality_assessment_id !== null) throw Error();
    const expected = assessRelease(row.result.inputs);
    if (
      row.result.policyVersion !== expected.policyVersion ||
      row.result.status !== expected.status
    )
      throw Error();
    for (const key of ['blockers', 'warnings', 'unknowns'] as const) {
      if (row.result[key].length !== expected[key].length) throw Error();
      row.result[key].forEach((s, i) => {
        if (
          s.code !== expected[key][i]!.code ||
          JSON.stringify(s.ids) !== JSON.stringify(expected[key][i]!.ids)
        )
          throw Error();
      });
    }
    return row;
  } catch {
    throw new PersistenceError('DATABASE');
  }
}
export function decodeReleaseDecision(row: ReleaseDecision): ReleaseDecision {
  ids(row);
  validateId(row.release_id);
  validateId(row.assessment_id);
  validateId(row.actor_id);
  validateReleaseText(row.rationale, 1000, row.decision !== 'APPROVE');
  if (
    !releaseDecisions.includes(row.decision) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    typeof row.is_override !== 'boolean'
  )
    throw new PersistenceError('DATABASE');
  return row;
}
export function decodeReleaseReport(row: ReleaseReport): ReleaseReport {
  try {
    ids(row);
    validateId(row.generated_by);
    if (
      row.report_version !== releaseReportVersion ||
      row.snapshot.reportVersion !== releaseReportVersion ||
      !/^[a-f0-9]{64}$/.test(row.fingerprint)
    )
      throw Error();
    const a = decodeReleaseAssessment(row.snapshot.assessment),
      d = row.snapshot.decision;
    if (
      a.id !== row.assessment_id ||
      a.release_id !== row.release_id ||
      row.snapshot.release.id !== row.release_id
    )
      throw Error();
    for (const key of [
      'workspace_id',
      'project_id',
      'environment_id',
      'api_import_id',
    ] as const)
      if (
        a[key] !== row[key] ||
        row.snapshot.release[key] !== row[key] ||
        (d && d[key] !== row[key])
      )
        throw Error();
    validateReleaseText(row.snapshot.release.name, 120);
    if (d) {
      decodeReleaseDecision(d);
      if (
        d.id !== row.decision_id ||
        d.assessment_id !== a.id ||
        d.release_id !== row.release_id
      )
        throw Error();
    } else if (row.decision_id !== null) throw Error();
    if (
      !['DEVELOPMENT', 'STAGING', 'PRODUCTION'].includes(
        row.snapshot.environmentType,
      )
    )
      throw Error();
    return row;
  } catch {
    throw new PersistenceError('DATABASE');
  }
}
function pageNumber(page: number) {
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000)
    throw new PersistenceError('DATABASE');
  return page;
}
export function createReleaseRepository(client: SupabaseClient) {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error)
      throw new PersistenceError(
        error.code === '40001'
          ? 'CONFLICT'
          : error.code === '42501'
            ? 'ACCESS'
            : 'DATABASE',
      );
    return validateId(data);
  }
  function scoped(table: string, workspace: string, project: string) {
    return client
      .from(table)
      .select('*')
      .eq('workspace_id', validateId(workspace))
      .eq('project_id', validateId(project));
  }
  return {
    create(project: string, environment: string, name: string) {
      return rpc('create_release', {
        project_input: validateId(project),
        environment_input: validateId(environment),
        name_input: validateReleaseText(name, 120),
      });
    },
    assess(release: string) {
      return rpc('assess_release', { release_input: validateId(release) });
    },
    decide(
      release: string,
      assessment: string,
      expected: string | null,
      decision: string,
      rationale: string,
    ) {
      if (!(releaseDecisions as readonly string[]).includes(decision))
        throw new PersistenceError('DATABASE');
      return rpc('decide_release', {
        release_input: validateId(release),
        assessment_input: validateId(assessment),
        expected_decision: expected === null ? null : validateId(expected),
        decision_input: decision,
        rationale_input: validateReleaseText(
          rationale,
          1000,
          decision !== 'APPROVE',
        ),
      });
    },
    generate(release: string, assessment: string) {
      return rpc('generate_release_report', {
        release_input: validateId(release),
        assessment_input: validateId(assessment),
      });
    },
    async list(
      workspace: string,
      project: string,
      page = 0,
    ): Promise<Release[]> {
      pageNumber(page);
      const { data, error } = await scoped('releases', workspace, project)
        .order('created_at', { ascending: false })
        .order('id')
        .range(page * 25, page * 25 + 24);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      return data.map(decodeRelease);
    },
    async detail(workspace: string, project: string, id: string, page = 0) {
      pageNumber(page);
      const { data, error } = await scoped('releases', workspace, project)
        .eq('id', validateId(id))
        .maybeSingle();
      if (error) throw new PersistenceError('DATABASE');
      if (!data) return null;
      const release = decodeRelease(data);
      const results = await Promise.all([
        scoped('release_assessments', workspace, project)
          .eq('release_id', id)
          .order('assessed_at', { ascending: false })
          .order('id')
          .range(page * 25, page * 25 + 24),
        scoped('release_decisions', workspace, project)
          .eq('release_id', id)
          .order('revision', { ascending: false })
          .range(page * 25, page * 25 + 24),
        scoped('release_reports', workspace, project)
          .eq('release_id', id)
          .order('generated_at', { ascending: false })
          .order('id')
          .range(page * 25, page * 25 + 24),
        release.assessment_id
          ? scoped('release_assessments', workspace, project)
              .eq('id', release.assessment_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        release.decision_id
          ? scoped('release_decisions', workspace, project)
              .eq('id', release.decision_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (results.some((r) => r.error)) throw new PersistenceError('DATABASE');
      return {
        release,
        assessments: (results[0]!.data ?? []).map(decodeReleaseAssessment),
        decisions: (results[1]!.data ?? []).map(decodeReleaseDecision),
        reports: (results[2]!.data ?? []).map(decodeReleaseReport),
        current: results[3]!.data
          ? decodeReleaseAssessment(results[3]!.data)
          : null,
        decision: results[4]!.data
          ? decodeReleaseDecision(results[4]!.data)
          : null,
      };
    },
    async reports(
      workspace: string,
      project: string,
      page = 0,
    ): Promise<ReleaseReport[]> {
      pageNumber(page);
      const { data, error } = await scoped(
        'release_reports',
        workspace,
        project,
      )
        .order('generated_at', { ascending: false })
        .order('id')
        .range(page * 25, page * 25 + 24);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      return data.map(decodeReleaseReport);
    },
    async report(
      workspace: string,
      project: string,
      id: string,
    ): Promise<ReleaseReport | null> {
      const { data, error } = await scoped(
        'release_reports',
        workspace,
        project,
      )
        .eq('id', validateId(id))
        .maybeSingle();
      if (error) throw new PersistenceError('DATABASE');
      return data ? decodeReleaseReport(data) : null;
    },
    async latestSource(
      workspace: string,
      project: string,
    ): Promise<string | null> {
      const { data, error } = await client
        .from('api_imports')
        .select('id')
        .eq('workspace_id', validateId(workspace))
        .eq('project_id', validateId(project))
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new PersistenceError('DATABASE');
      return data ? validateId(data.id) : null;
    },
  };
}
