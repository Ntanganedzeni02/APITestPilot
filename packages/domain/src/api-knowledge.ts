import { ValidationError, validateId } from './index.js';

export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export interface ApiParameter {
  name: string;
  location: string;
  required: boolean;
  description: string | null;
  schema: Json;
  content: Json;
  sourcePointer: string;
}
export interface ApiOperation {
  key: string;
  method: string;
  path: string;
  operationId: string | null;
  summary: string | null;
  description: string | null;
  tags: string[];
  deprecated: boolean;
  parameters: ApiParameter[];
  requestBody: {
    required: boolean;
    description: string | null;
    content: Json;
    sourcePointer: string;
  } | null;
  responses: {
    status: string;
    description: string;
    content: Json;
    headers: Json;
    sourcePointer: string;
  }[];
  security: Json;
  servers: Json;
  sourcePointer: string;
}
export interface ApiKnowledge {
  modelVersion: 1;
  title: string;
  version: string;
  description: string | null;
  openapiVersion: string;
  servers: Json;
  tags: Json;
  globalSecurity: Json;
  securitySchemes: Json;
  components: Json;
  schemaCount: number;
  componentCount: number;
  operations: ApiOperation[];
  references: { sourcePointer: string; targetPointer: string }[];
}
export interface ApiImportInput {
  format: 'json' | 'yaml';
  filename: string | null;
  sourceBytes: number;
  sourceHash: string;
  sourceDocument: Json;
  knowledge: ApiKnowledge;
}
export interface ApiImportSummary {
  id: string;
  workspaceId: string;
  projectId: string;
  createdAt: string;
  createdBy: string;
  knowledge: ApiKnowledge;
}
export interface ApiKnowledgeRepository {
  list(workspaceId: string, projectId: string): Promise<ApiImportSummary[]>;
  save(
    workspaceId: string,
    projectId: string,
    input: ApiImportInput,
  ): Promise<string>;
}
export function assertApiKnowledge(
  value: unknown,
): asserts value is ApiKnowledge {
  const bad = () => {
    throw new ValidationError('Invalid normalized API knowledge.');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad();
  const k = value as Record<string, unknown>;
  let nodes = 0;
  function json(v: unknown, depth = 0): boolean {
    if (++nodes > 150000 || depth > 70) return false;
    if (v === null || typeof v === 'string' || typeof v === 'boolean')
      return true;
    if (typeof v === 'number') return Number.isFinite(v);
    if (Array.isArray(v)) return v.every((child) => json(child, depth + 1));
    if (!v || typeof v !== 'object') return false;
    return Object.entries(v).every(
      ([key, child]) =>
        !['__proto__', 'constructor', 'prototype'].includes(key) &&
        json(child, depth + 1),
    );
  }
  const obj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const nullableText = (v: unknown) => v === null || typeof v === 'string';
  const strings = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((s) => typeof s === 'string');
  if (
    !json(value) ||
    k['modelVersion'] !== 1 ||
    typeof k['title'] !== 'string' ||
    typeof k['version'] !== 'string' ||
    !nullableText(k['description']) ||
    typeof k['openapiVersion'] !== 'string' ||
    !/^3\.[01]\.\d+$/.test(k['openapiVersion']) ||
    !Array.isArray(k['operations']) ||
    k['operations'].length > 2000 ||
    !Array.isArray(k['references']) ||
    !Number.isInteger(k['schemaCount']) ||
    !Number.isInteger(k['componentCount']) ||
    (k['schemaCount'] as number) < 0 ||
    !Array.isArray(k['servers']) ||
    !Array.isArray(k['tags']) ||
    !Array.isArray(k['globalSecurity']) ||
    !obj(k['components']) ||
    !obj(k['securitySchemes'])
  )
    return bad();
  for (const ref of k['references'])
    if (
      !obj(ref) ||
      typeof ref['sourcePointer'] !== 'string' ||
      typeof ref['targetPointer'] !== 'string' ||
      !ref['targetPointer'].startsWith('#/')
    )
      return bad();
  const keys = new Set<string>();
  for (const value of k['operations']) {
    if (!value || typeof value !== 'object') return bad();
    const o = value as Record<string, unknown>;
    if (
      typeof o['key'] !== 'string' ||
      keys.has(o['key']) ||
      typeof o['method'] !== 'string' ||
      ![
        'GET',
        'PUT',
        'POST',
        'DELETE',
        'OPTIONS',
        'HEAD',
        'PATCH',
        'TRACE',
      ].includes(o['method']) ||
      typeof o['path'] !== 'string' ||
      !o['path'].startsWith('/') ||
      o['key'] !== `${o['method']} ${o['path']}` ||
      !Array.isArray(o['parameters']) ||
      !Array.isArray(o['responses']) ||
      !strings(o['tags']) ||
      typeof o['sourcePointer'] !== 'string' ||
      !nullableText(o['operationId']) ||
      !nullableText(o['summary']) ||
      !nullableText(o['description']) ||
      typeof o['deprecated'] !== 'boolean' ||
      !Array.isArray(o['security']) ||
      !Array.isArray(o['servers'])
    )
      return bad();
    for (const p of o['parameters'])
      if (
        !obj(p) ||
        typeof p['name'] !== 'string' ||
        !['path', 'query', 'header', 'cookie'].includes(
          p['location'] as string,
        ) ||
        typeof p['required'] !== 'boolean' ||
        !nullableText(p['description']) ||
        typeof p['sourcePointer'] !== 'string' ||
        !Object.hasOwn(p, 'schema') ||
        !Object.hasOwn(p, 'content')
      )
        return bad();
    for (const r of o['responses'])
      if (
        !obj(r) ||
        typeof r['status'] !== 'string' ||
        typeof r['description'] !== 'string' ||
        typeof r['sourcePointer'] !== 'string' ||
        !obj(r['content']) ||
        !obj(r['headers'])
      )
        return bad();
    const body = o['requestBody'];
    if (
      body !== null &&
      (!obj(body) ||
        typeof body['required'] !== 'boolean' ||
        !nullableText(body['description']) ||
        !obj(body['content']) ||
        typeof body['sourcePointer'] !== 'string')
    )
      return bad();
    keys.add(o['key']);
  }
}
export function validateApiImportScope(workspaceId: string, projectId: string) {
  return {
    workspaceId: validateId(workspaceId),
    projectId: validateId(projectId),
  };
}
