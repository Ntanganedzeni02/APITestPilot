import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateId,
  assertMemoryOperation,
  assessQuality,
  qualityWeights,
  memoryKinds,
  memoryCurrentness,
  type MemoryFact,
  type MemoryObservation,
  type QualityAssessment,
  type MemoryQualityQuery,
  type EvidencePackage,
  type EvidenceItem,
  type ExecutionResult,
} from '@testpilot/domain';
import { PersistenceError } from './index.js';
function checkedPage(page: number) {
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000)
    throw new PersistenceError('DATABASE');
  return page;
}
/** Validate supported persisted snapshot arithmetic before presenting intelligence. */
export function decodeQualityAssessment(value: unknown): QualityAssessment {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error();
    const a = value as QualityAssessment;
    for (const key of [
      'id',
      'workspace_id',
      'project_id',
      'environment_id',
      'created_by',
    ] as const)
      validateId(a[key]);
    if (a.api_import_id !== null) validateId(a.api_import_id);
    if (
      a.scoring_version !== 'api-quality-v1' ||
      !/^[a-f0-9]{64}$/.test(a.fingerprint) ||
      !Number.isFinite(Date.parse(a.assessed_at))
    )
      throw Error();
    const expected = assessQuality(a.result.inputs);
    for (const key of [
      'overall',
      'sufficiency',
      'confidence',
      'status',
      'scoringVersion',
    ] as const)
      if (a.result[key] !== expected[key]) throw Error();
    for (const key of Object.keys(
      qualityWeights,
    ) as (keyof typeof qualityWeights)[]) {
      for (const field of [
        'score',
        'numerator',
        'denominator',
        'weight',
        'basis',
      ] as const)
        if (a.result.dimensions[key][field] !== expected.dimensions[key][field])
          throw Error();
    }
    if (a.result.inputs.sourceId !== a.api_import_id) throw Error();
    if (a.result.inputs.analysisId !== null)
      validateId(a.result.inputs.analysisId);
    for (const key of ['requirements', 'risks', 'operations'] as const) {
      const list = a.result.inputs.gaps[key];
      if (!Array.isArray(list) || list.length > 55000) throw Error();
      for (const id of list)
        if (key === 'operations') {
          if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))
            throw Error();
        } else validateId(id);
    }
    for (const key of [
      'runIds',
      'packageIds',
      'findingIds',
      'reviewIds',
    ] as const) {
      const list = a.result.inputs.provenance[key];
      if (!Array.isArray(list) || list.length > 55000) throw Error();
      list.forEach(validateId);
    }
    if (!/^[a-f0-9]{64}$/.test(a.result.inputs.provenance.stateHash))
      throw Error();
    return a;
  } catch {
    throw new PersistenceError('DATABASE');
  }
}
export function createMemoryQualityRepository(client: SupabaseClient) {
  async function invoke(name: string, project: string, environment: string) {
    const { data, error } = await client.rpc(name, {
      project_input: validateId(project),
      environment_input: validateId(environment),
    });
    if (error)
      throw new PersistenceError(
        error.code === '42501' ? 'ACCESS' : 'DATABASE',
      );
    return data;
  }
  const reads: Pick<MemoryQualityQuery, 'listFacts' | 'history'> = {
    async listFacts(workspace, project, environment, filters = {}) {
      const page = checkedPage(filters.page ?? 0);
      if (
        (filters.kind &&
          !(memoryKinds as readonly string[]).includes(filters.kind)) ||
        (filters.currentness &&
          !(memoryCurrentness as readonly string[]).includes(
            filters.currentness,
          )) ||
        (filters.operation && filters.operation.length > 2000)
      )
        throw new PersistenceError('DATABASE');
      let q = client
        .from('project_memory')
        .select('*')
        .eq('workspace_id', validateId(workspace))
        .eq('project_id', validateId(project))
        .eq('environment_id', validateId(environment));
      if (filters.kind) q = q.eq('kind', filters.kind);
      if (filters.currentness) q = q.eq('currentness', filters.currentness);
      if (filters.operation) q = q.eq('operation_id', filters.operation);
      const { data, error } = await q
        .order('last_observed_at', { ascending: false })
        .order('id')
        .range(page * 25, page * 25 + 24);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      for (const fact of data) assertMemoryOperation(fact.operation_id);
      return data as MemoryFact[];
    },
    async history(workspace, project, environment, page = 0) {
      checkedPage(page);
      const { data, error } = await client
        .from('quality_assessments')
        .select('*')
        .eq('workspace_id', validateId(workspace))
        .eq('project_id', validateId(project))
        .eq('environment_id', validateId(environment))
        .order('assessed_at', { ascending: false })
        .order('id')
        .range(page * 25, page * 25 + 24);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      return data.map(decodeQualityAssessment);
    },
  };
  return {
    ...reads,
    async refresh(project: string, environment: string) {
      const value = await invoke(
        'refresh_project_memory',
        project,
        environment,
      );
      if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0
      )
        throw new PersistenceError('DATABASE');
      return value;
    },
    async assess(project: string, environment: string) {
      return validateId(
        await invoke('assess_project_quality', project, environment),
      );
    },
    async detail(workspace: string, project: string, id: string, page = 0) {
      checkedPage(page);
      const { data: fact, error } = await client
        .from('project_memory')
        .select('*')
        .eq('workspace_id', validateId(workspace))
        .eq('project_id', validateId(project))
        .eq('id', validateId(id))
        .maybeSingle();
      if (error) throw new PersistenceError('DATABASE');
      if (!fact) return null;
      assertMemoryOperation(fact.operation_id);
      const { data: observations, error: failure } = await client
        .from('memory_observations')
        .select('*')
        .eq('workspace_id', workspace)
        .eq('project_id', project)
        .eq('fact_id', id)
        .order('observed_at', { ascending: false })
        .order('id')
        .range(page * 25, page * 25 + 24);
      if (failure || !Array.isArray(observations))
        throw new PersistenceError('DATABASE');
      return {
        fact: fact as MemoryFact,
        observations: observations as MemoryObservation[],
      };
    },
    async current(workspace: string, project: string, environment: string) {
      const { data: head, error } = await client
        .from('quality_heads')
        .select('*')
        .eq('workspace_id', validateId(workspace))
        .eq('project_id', validateId(project))
        .eq('environment_id', validateId(environment))
        .maybeSingle();
      if (error) throw new PersistenceError('DATABASE');
      if (!head) return { current: null, previous: null };
      const ids = [
        head.assessment_id,
        ...(head.previous_id ? [head.previous_id] : []),
      ];
      const { data, error: failure } = await client
        .from('quality_assessments')
        .select('*')
        .eq('workspace_id', workspace)
        .eq('project_id', project)
        .eq('environment_id', environment)
        .in('id', ids);
      if (
        failure ||
        !Array.isArray(data) ||
        !data.some((a) => a.id === head.assessment_id)
      )
        throw new PersistenceError('DATABASE');
      return {
        current: decodeQualityAssessment(
          data.find((a) => a.id === head.assessment_id),
        ),
        previous: head.previous_id
          ? decodeQualityAssessment(data.find((a) => a.id === head.previous_id))
          : null,
      };
    },
    async provenance(
      workspace: string,
      project: string,
      observationId: string,
    ) {
      const { data: observation, error } = await client
        .from('memory_observations')
        .select('*')
        .eq('workspace_id', validateId(workspace))
        .eq('project_id', validateId(project))
        .eq('id', validateId(observationId))
        .maybeSingle();
      if (error) throw new PersistenceError('DATABASE');
      if (!observation) return null;
      const { data: pkg, error: packageError } = await client
        .from('evidence_packages')
        .select('*')
        .eq('workspace_id', workspace)
        .eq('project_id', project)
        .eq('id', observation.package_id)
        .eq('run_id', observation.run_id)
        .maybeSingle();
      const { data: items, error: itemError } = await client
        .from('evidence_items')
        .select('*')
        .eq('workspace_id', workspace)
        .eq('project_id', project)
        .eq('package_id', observation.package_id)
        .order('id')
        .limit(40);
      const { data: result, error: resultError } = await client
        .from('execution_results')
        .select('result')
        .eq('workspace_id', workspace)
        .eq('run_id', observation.run_id)
        .maybeSingle();
      if (
        packageError ||
        itemError ||
        resultError ||
        !pkg ||
        !result ||
        !Array.isArray(items)
      )
        throw new PersistenceError('DATABASE');
      return {
        observation: observation as MemoryObservation,
        package: pkg as EvidencePackage,
        items: items as EvidenceItem[],
        result: result.result as ExecutionResult,
      };
    },
    async latestSource(workspace: string, project: string) {
      const { data, error } = await client
        .from('api_imports')
        .select('id')
        .eq('workspace_id', validateId(workspace))
        .eq('project_id', validateId(project))
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      return data[0]?.id as string | undefined;
    },
  };
}
