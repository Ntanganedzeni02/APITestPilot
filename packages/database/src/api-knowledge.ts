import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertApiKnowledge,
  validateApiImportScope,
  validateId,
  type ApiImportInput,
  type ApiImportSummary,
  type ApiKnowledgeRepository,
} from '@testpilot/domain';
import { createTenantService, PersistenceError } from './index.js';

export function createApiKnowledgeRepository(
  client: SupabaseClient,
): ApiKnowledgeRepository {
  const tenants = createTenantService(client);
  async function authorize(workspaceId: string, projectId: string) {
    const scope = validateApiImportScope(workspaceId, projectId);
    const projects = await tenants.getWorkspaceProjects(scope.workspaceId);
    if (!projects.some((p) => p.id === scope.projectId))
      throw new PersistenceError('ACCESS');
    return scope;
  }
  return {
    async save(workspaceId: string, projectId: string, input: ApiImportInput) {
      const scope = await authorize(workspaceId, projectId);
      assertApiKnowledge(input.knowledge);
      const { data, error } = await client.rpc('import_api_spec', {
        target_workspace: scope.workspaceId,
        target_project: scope.projectId,
        input_format: input.format,
        input_filename: input.filename,
        input_bytes: input.sourceBytes,
        input_hash: input.sourceHash,
        input_document: input.sourceDocument,
        input_knowledge: input.knowledge,
      });
      if (error)
        throw new PersistenceError(
          error.code === '42501' ? 'ACCESS' : 'DATABASE',
        );
      return validateId(data);
    },
    async list(workspaceId: string, projectId: string) {
      const scope = await authorize(workspaceId, projectId);
      const { data, error } = await client
        .from('api_imports')
        .select('id,workspace_id,project_id,created_by,created_at,knowledge')
        .eq('workspace_id', scope.workspaceId)
        .eq('project_id', scope.projectId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(50);
      if (error || !Array.isArray(data)) throw new PersistenceError('DATABASE');
      return data.map((value: unknown): ApiImportSummary => {
        if (!value || typeof value !== 'object')
          throw new PersistenceError('DATABASE');
        const row = value as Record<string, unknown>;
        assertApiKnowledge(row['knowledge']);
        const ws = validateId(row['workspace_id']);
        const project = validateId(row['project_id']);
        if (
          ws !== scope.workspaceId ||
          project !== scope.projectId ||
          typeof row['created_at'] !== 'string' ||
          !Number.isFinite(Date.parse(row['created_at']))
        )
          throw new PersistenceError('DATABASE');
        return {
          id: validateId(row['id']),
          workspaceId: ws,
          projectId: project,
          createdBy: validateId(row['created_by']),
          createdAt: row['created_at'],
          knowledge: row['knowledge'],
        };
      });
    },
  };
}
