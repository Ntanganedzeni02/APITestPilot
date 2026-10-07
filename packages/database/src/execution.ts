import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateId,
  type ExecutionRun,
  type ExecutionTarget,
  type ExecutionResult,
  type EnvironmentType,
} from '@testpilot/domain';
import { PersistenceError } from './index.js';
export function createExecutionRepository(client: SupabaseClient) {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error)
      throw new PersistenceError(
        error.code === '42501' ? 'ACCESS' : 'DATABASE',
      );
    return data;
  }
  async function list(workspaceId: string, projectId: string) {
    validateId(workspaceId);
    validateId(projectId);
    const runs = await client
      .from('execution_runs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (runs.error || !Array.isArray(runs.data))
      throw new PersistenceError('DATABASE');
    const result: ExecutionRun[] = [];
    for (const r of runs.data) {
      validateId(r.id);
      const saved = await client
        .from('execution_results')
        .select('result')
        .eq('run_id', r.id)
        .maybeSingle();
      if (saved.error) throw new PersistenceError('DATABASE');
      result.push({
        ...r,
        result: (saved.data?.result as ExecutionResult | null) ?? null,
      } as ExecutionRun);
    }
    return result;
  }
  async function configs(workspaceId: string, projectId: string) {
    const response = await client
      .from('environment_execution_configs')
      .select('*')
      .eq('workspace_id', validateId(workspaceId))
      .eq('project_id', validateId(projectId))
      .order('created_at', { ascending: false })
      .limit(100);
    if (response.error || !Array.isArray(response.data))
      throw new PersistenceError('DATABASE');
    return response.data as {
      id: string;
      environment_id: string;
      base_url: string;
      enabled: boolean;
      port: number;
      timeout_ms: number;
      response_limit: number;
    }[];
  }
  return {
    list,
    configs,
    async configure(
      environment: string,
      url: string,
      port: number,
      enabled: boolean,
    ) {
      return validateId(
        await rpc('configure_execution_environment', {
          environment_input: validateId(environment),
          base_input: url,
          port_input: port,
          enabled_input: enabled,
          timeout_input: 10000,
          response_input: 1048576,
        }),
      );
    },
    async request(caseId: string, environment: string) {
      return validateId(
        await rpc('request_test_execution', {
          case_input: validateId(caseId),
          environment_input: validateId(environment),
        }),
      );
    },
    async approve(runId: string, fingerprint: string, approved: boolean) {
      await rpc('decide_execution_approval', {
        run_input: validateId(runId),
        fingerprint_input: fingerprint,
        approve_input: approved,
      });
    },
    async cancel(runId: string) {
      await rpc('cancel_test_execution', { run_input: validateId(runId) });
    },
  };
}
export function executionTarget(
  config: {
    id: string;
    environment_id: string;
    base_url: string;
    enabled: boolean;
    port: number;
    timeout_ms: number;
    response_limit: number;
  },
  type: EnvironmentType,
): ExecutionTarget {
  return {
    id: config.id,
    environmentId: config.environment_id,
    type,
    baseUrl: config.base_url,
    enabled: config.enabled,
    port: config.port,
    timeoutMs: config.timeout_ms,
    responseLimit: config.response_limit,
  };
}
