// Core business concepts and rules; infrastructure-independent.
export * from './api-knowledge.js';
export * from './behaviour-graph.js';
export * from './qa-intelligence.js';
export const workspaceRoles = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];
export const environmentTypes = [
  'DEVELOPMENT',
  'STAGING',
  'PRODUCTION',
] as const;
export type EnvironmentType = (typeof environmentTypes)[number];
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
export function validateName(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('Enter a name.');
  const name = value.trim();
  if (
    [...name].length < 2 ||
    [...name].length > 80 ||
    [...name].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new ValidationError(
      'Use 2–80 characters without control characters.',
    );
  return name;
}
export function validateId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ValidationError('Invalid resource identifier.');
  return value;
}
export interface Workspace {
  id: string;
  name: string;
  role: WorkspaceRole;
}
export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  created_by: string;
}
export interface ProjectEnvironment {
  id: string;
  project_id: string;
  type: EnvironmentType;
  created_at: string;
  updated_at: string;
}
export interface TenantRepository {
  getUserWorkspaces(): Promise<Workspace[]>;
  requireMembership(workspaceId: string): Promise<string>;
  createWorkspace(name: string): Promise<string>;
  getWorkspaceProjects(workspaceId: string): Promise<Project[]>;
  createProject(workspaceId: string, name: string): Promise<string>;
  getProjectEnvironments(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectEnvironment[]>;
}

export * from './test-planning.js';
