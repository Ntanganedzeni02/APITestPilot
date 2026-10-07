import type { SupabaseClient } from '@supabase/supabase-js';
export * from './api-knowledge.js';
export * from './behaviour-graph.js';
export * from './qa-intelligence.js';
import {
  environmentTypes,
  workspaceRoles,
  validateId,
  validateName,
  type Workspace,
  type Project,
  type ProjectEnvironment,
  type TenantRepository,
} from '@testpilot/domain';

export class PersistenceError extends Error {
  constructor(
    public readonly kind: 'AUTHENTICATION' | 'ACCESS' | 'DATABASE' | 'CONFLICT',
  ) {
    super(
      kind === 'AUTHENTICATION'
        ? 'Please sign in again.'
        : kind === 'ACCESS'
          ? 'This resource is unavailable.'
          : kind === 'CONFLICT'
            ? 'This proposal changed. Reload before recording another review.'
            : 'Unable to save or load your data. Please try again.',
    );
  }
}
// Runtime-validated adapter contracts; these are not generated database types.
// Provider responses stay untrusted until checked. Migrations are schema authority.
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new PersistenceError('DATABASE');
  return value as Record<string, unknown>;
}
function field(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new PersistenceError('DATABASE');
  return value;
}
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new PersistenceError('DATABASE');
  return value.map(record);
}
function timestamp(row: Record<string, unknown>, key: string) {
  const value = field(row, key);
  if (!Number.isFinite(Date.parse(value)))
    throw new PersistenceError('DATABASE');
  return value;
}
export function decodeProject(value: unknown): Project {
  const row = record(value);
  return {
    id: validateId(field(row, 'id')),
    workspace_id: validateId(field(row, 'workspace_id')),
    name: validateName(field(row, 'name')),
    created_at: timestamp(row, 'created_at'),
    updated_at: timestamp(row, 'updated_at'),
    created_by: validateId(field(row, 'created_by')),
  };
}
export function decodeEnvironment(value: unknown): ProjectEnvironment {
  const row = record(value);
  const type = field(row, 'type');
  if (!environmentTypes.some((entry) => entry === type))
    throw new PersistenceError('DATABASE');
  return {
    id: validateId(field(row, 'id')),
    project_id: validateId(field(row, 'project_id')),
    type: type as ProjectEnvironment['type'],
    created_at: timestamp(row, 'created_at'),
    updated_at: timestamp(row, 'updated_at'),
  };
}
export function createTenantService(client: SupabaseClient): TenantRepository {
  async function userId() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new PersistenceError('AUTHENTICATION');
    return data.user.id;
  }
  async function requireMembership(workspaceId: string) {
    const id = validateId(workspaceId);
    const user = await userId();
    const { data, error } = await client
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', id)
      .eq('user_id', user)
      .maybeSingle();
    if (error) throw new PersistenceError('DATABASE');
    if (!data) throw new PersistenceError('ACCESS');
    const role = field(record(data), 'role');
    if (!workspaceRoles.some((value) => value === role))
      throw new PersistenceError('DATABASE');
    return id;
  }
  async function getUserWorkspaces(): Promise<Workspace[]> {
    const user = await userId();
    const { data, error } = await client
      .from('workspace_members')
      .select('role, workspaces(id, name)')
      .eq('user_id', user)
      .order('created_at')
      .order('workspace_id');
    if (error) throw new PersistenceError('DATABASE');
    return rows(data).map((row) => {
      const workspace = record(row['workspaces']);
      const role = field(row, 'role');
      if (!workspaceRoles.some((value) => value === role))
        throw new PersistenceError('DATABASE');
      return {
        id: validateId(field(workspace, 'id')),
        name: validateName(field(workspace, 'name')),
        role: role as Workspace['role'],
      };
    });
  }
  async function getWorkspaceProjects(workspaceId: string): Promise<Project[]> {
    const id = await requireMembership(workspaceId);
    const { data, error } = await client
      .from('projects')
      .select('id, workspace_id, name, created_at, updated_at, created_by')
      .eq('workspace_id', id)
      .order('created_at')
      .order('id');
    if (error) throw new PersistenceError('DATABASE');
    const projects = rows(data).map(decodeProject);
    if (projects.some((project) => project.workspace_id !== id))
      throw new PersistenceError('DATABASE');
    return projects;
  }
  return {
    getUserWorkspaces,
    getWorkspaceProjects,
    requireMembership,
    async createWorkspace(name: string): Promise<string> {
      const workspaceName = validateName(name);
      await userId();
      const { data, error } = await client.rpc('create_workspace', {
        workspace_name: workspaceName,
      });
      if (error) throw new PersistenceError('DATABASE');
      return validateId(data);
    },
    async createProject(workspaceId: string, name: string): Promise<string> {
      const projectName = validateName(name);
      const id = await requireMembership(workspaceId);
      const { data, error } = await client.rpc('create_project', {
        target_workspace: id,
        project_name: projectName,
      });
      if (error)
        throw new PersistenceError(
          error.code === '42501' ? 'ACCESS' : 'DATABASE',
        );
      return validateId(data);
    },
    async getProjectEnvironments(
      workspaceId: string,
      projectId: string,
    ): Promise<ProjectEnvironment[]> {
      const id = validateId(projectId);
      const projects = await getWorkspaceProjects(workspaceId);
      if (!projects.some((project) => project.id === id))
        throw new PersistenceError('ACCESS');
      const { data, error } = await client
        .from('environments')
        .select('id, project_id, type, created_at, updated_at')
        .eq('project_id', id)
        .order('type');
      if (error) throw new PersistenceError('DATABASE');
      const environments = rows(data).map(decodeEnvironment);
      if (
        environments.length !== 3 ||
        new Set(environments.map((entry) => entry.type)).size !== 3 ||
        environments.some((entry) => entry.project_id !== id)
      )
        throw new PersistenceError('DATABASE');
      return environments;
    },
  };
}

export * from './test-planning.js';
