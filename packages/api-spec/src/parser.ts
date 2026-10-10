import { parseDocument } from 'yaml';
import { createHash } from 'node:crypto';
import {
  ValidationError,
  assertApiKnowledge,
  type Json,
  type ApiKnowledge,
  type ApiImportInput,
  type ApiOperation,
  type ApiParameter,
} from '@testpilot/domain';
import { validateDocument } from './validation.js';

export const MAX_SPEC_BYTES = 2 * 1024 * 1024;
export class SpecError extends ValidationError {
  constructor(
    public readonly code: string,
    message: string,
    public readonly pointer = '',
  ) {
    super(message);
  }
}
type Obj = Record<string, Json>;
const object = (v: Json | undefined): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
const text = (v: Json | undefined) => (typeof v === 'string' ? v : null);
const escape = (s: string) => s.replaceAll('~', '~0').replaceAll('/', '~1');
const methods = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
];
export function formatForFilename(filename: string): 'json' | 'yaml' {
  if (
    filename.length > 180 ||
    [...filename].some((c) => c.charCodeAt(0) < 32 || c === '/' || c === '\\')
  )
    throw new SpecError('FILE_TYPE', 'Use a plain specification filename.');
  const ext = filename.split('.').at(-1)?.toLowerCase();
  if (ext === 'json') return 'json';
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  throw new SpecError(
    'FILE_TYPE',
    'Upload a .json, .yaml or .yml specification.',
  );
}
export function parseApiSpec(
  source: string,
  format: 'json' | 'yaml',
  filename: string | null = null,
): ApiImportInput {
  const sourceBytes = Buffer.byteLength(source, 'utf8');
  if (sourceBytes > MAX_SPEC_BYTES)
    throw new SpecError('SIZE', 'Specifications must be no larger than 2 MiB.');
  let document: Json;
  try {
    if (format === 'json') {
      document = JSON.parse(source.replace(/^\uFEFF/, '')) as Json;
      // JSON.parse otherwise silently overwrites duplicate object keys.
      if (parseDocument(source, { uniqueKeys: true }).errors.length)
        throw new Error('Duplicate JSON keys');
    } else {
      const parsed = parseDocument(source, {
        uniqueKeys: true,
        schema: 'core',
        customTags: [],
        strict: true,
      });
      if (parsed.errors.length || parsed.warnings.length)
        throw new Error('Invalid YAML');
      document = parsed.toJS({ maxAliasCount: 0 }) as Json;
    }
  } catch {
    throw new SpecError(
      'SYNTAX',
      `Invalid ${format === 'json' ? 'JSON' : 'YAML'}. Check syntax; YAML aliases and custom tags are unsupported.`,
    );
  }
  const root = object(document);
  if (root['swagger'] !== undefined)
    throw new SpecError(
      'VERSION',
      'Swagger/OpenAPI 2.0 is unsupported. Import OpenAPI 3.0.x or 3.1.x.',
    );
  if (!root['openapi'])
    throw new SpecError(
      'NOT_OPENAPI',
      'This document is not an OpenAPI specification.',
    );
  const version = text(root['openapi']) ?? '';
  if (!version || !/^3\.[01]\.\d+$/.test(version))
    throw new SpecError(
      'VERSION',
      'Supported versions are OpenAPI 3.0.x and 3.1.x.',
    );
  const references: ApiKnowledge['references'] = [];
  let nodes = 0;
  function pointer(ref: string): Json {
    if (!ref.startsWith('#/'))
      throw new SpecError(
        'REMOTE_REF',
        'External and non-pointer references are unsupported. Use local #/ references.',
      );
    let parts: string[];
    try {
      parts = decodeURIComponent(ref.slice(2))
        .split('/')
        .map((p) => {
          if (/~(?![01])/.test(p)) throw new Error();
          return p.replaceAll('~1', '/').replaceAll('~0', '~');
        });
    } catch {
      throw new SpecError('LOCAL_REF', 'Invalid local reference.');
    }
    let target: Json | undefined = document;
    for (const part of parts) {
      if (!target || typeof target !== 'object' || !Object.hasOwn(target, part))
        throw new SpecError('LOCAL_REF', 'Unresolved local reference.');
      target = (target as Obj)[part];
    }
    if (target === undefined)
      throw new SpecError('LOCAL_REF', 'Unresolved local reference.');
    return target;
  }
  function walk(value: Json, path = '', depth = 0) {
    if (++nodes > 50000 || depth > 64)
      throw new SpecError(
        'COMPLEXITY',
        'Specification exceeds structural limits (50,000 nodes / depth 64).',
      );
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new SpecError('SYNTAX', 'Only finite JSON numbers are supported.');
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['$id', '$anchor', '$dynamicAnchor', '$dynamicRef'].includes(key))
        throw new SpecError(
          'REFERENCE_SCOPE',
          'Schema IDs, anchors and dynamic references are unsupported; use root-local JSON pointers.',
          path,
        );
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new SpecError(
          'UNSAFE_KEY',
          'Unsafe object key in specification.',
          path,
        );
      const childPath = `${path}/${escape(key)}`;
      if (key === '$ref' || key === '$dynamicRef') {
        if (typeof child !== 'string')
          throw new SpecError(
            'LOCAL_REF',
            'Reference must be a string.',
            childPath,
          );
        pointer(child);
        references.push({ sourcePointer: childPath, targetPointer: child });
      }
      walk(child, childPath, depth + 1);
    }
  }
  walk(document);
  const diagnostic = validateDocument(document, version);
  if (diagnostic)
    throw new SpecError(
      'STRUCTURE',
      `Invalid OpenAPI structure (${diagnostic.keyword}). Check required fields and object shapes.`,
      diagnostic.pointer,
    );
  function sanitize(value: Json, owner = ''): Json {
    if (Array.isArray(value)) return value.map((v) => sanitize(v, owner));
    if (!value || typeof value !== 'object') return value;
    const namedMap = [
      'properties',
      'schemas',
      'responses',
      'headers',
      'content',
      'securitySchemes',
      'paths',
      '$defs',
      'patternProperties',
    ].includes(owner);
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            namedMap ||
            (!['example', 'examples', 'default'].includes(key) &&
              !key.startsWith('x-')),
        )
        .map(([key, child]) => [key, sanitize(child, namedMap ? '' : key)]),
    );
  }
  function checkServers(value: Json) {
    if (Array.isArray(value)) {
      for (const item of value) checkServers(item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'servers' && Array.isArray(child))
        for (const entry of child) {
          const url = text(object(entry)['url']) ?? '';
          if (/[?#]/.test(url) || /\/\/[^/]*@/.test(url))
            throw new SpecError(
              'CREDENTIAL_URL',
              'Server URLs cannot contain credentials, query strings or fragments.',
            );
        }
      checkServers(child);
    }
  }
  checkServers(document);
  document = sanitize(document);
  references.length = 0;
  nodes = 0;
  walk(document);
  const api = object(document);
  function resolve(value: Json | undefined, seen = new Set<string>()): Obj {
    const obj = object(value);
    const ref = text(obj['$ref']);
    if (!ref) return obj;
    if (seen.size >= 64)
      throw new SpecError(
        'COMPLEXITY',
        'Non-schema reference chains may contain at most 64 links.',
      );
    if (seen.has(ref))
      throw new SpecError('LOCAL_REF', 'Cyclic reference outside a schema.');
    seen.add(ref);
    const resolved = resolve(pointer(ref), seen);
    return version.startsWith('3.1.')
      ? {
          ...resolved,
          ...Object.fromEntries(
            Object.entries(obj).filter(([k]) => k !== '$ref'),
          ),
        }
      : resolved;
  }
  const operations: ApiOperation[] = [];
  const identities = new Set<string>();
  const ids = new Set<string>();
  for (const [path, pathValue] of Object.entries(object(api['paths'])).sort(
    ([a], [b]) => a.localeCompare(b, 'en'),
  )) {
    const item = resolve(pathValue);
    for (const method of methods) {
      if (!item[method]) continue;
      const op = object(item[method]);
      const key = `${method.toUpperCase()} ${path}`;
      const identity = `${method} ${path.replace(/\{[^}]+\}/g, '{}')}`;
      const opId = text(op['operationId']);
      if (identities.has(identity) || (opId !== null && ids.has(opId)))
        throw new SpecError(
          'DUPLICATE_OPERATION',
          'Duplicate operationId or conflicting method/path identity.',
        );
      identities.add(identity);
      if (opId !== null) ids.add(opId);
      const sourcePointer = `#/paths/${escape(path)}/${method}`;
      const parameters = new Map<string, ApiParameter>();
      for (const [owner, list] of [
        [`#/paths/${escape(path)}`, item['parameters']],
        [sourcePointer, op['parameters']],
      ] as const) {
        const local = new Set<string>();
        if (Array.isArray(list))
          list.forEach((value, index) => {
            const p = resolve(value);
            const name = text(p['name'])!;
            const location = text(p['in'])!;
            const identity = `${location}:${name}`;
            if (local.has(identity))
              throw new SpecError(
                'PARAMETERS',
                'Duplicate parameters within one parameter list.',
              );
            local.add(identity);
            parameters.set(identity, {
              name,
              location,
              required: p['required'] === true,
              description: text(p['description']),
              schema: p['schema'] ?? null,
              content: p['content'] ?? null,
              sourcePointer: `${owner}/parameters/${index}`,
            });
          });
      }
      const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      if (
        placeholders.some((name) => !parameters.has(`path:${name}`)) ||
        [...parameters.values()].some(
          (p) =>
            p.location === 'path' &&
            (!p.required || !placeholders.includes(p.name)),
        )
      )
        throw new SpecError(
          'PARAMETERS',
          'Every path placeholder requires a matching required path parameter.',
        );
      const body = op['requestBody'] ? resolve(op['requestBody']) : null;
      const security = op['security'] ?? api['security'] ?? [];
      const schemes = object(object(api['components'])['securitySchemes']);
      for (const requirement of Array.isArray(security) ? security : [])
        for (const name of Object.keys(object(requirement)))
          if (!Object.hasOwn(schemes, name))
            throw new SpecError(
              'SECURITY',
              'Security requirement refers to an undeclared scheme.',
            );
      operations.push({
        key,
        method: method.toUpperCase(),
        path,
        operationId: opId,
        summary: text(op['summary']),
        description: text(op['description']),
        tags: Array.isArray(op['tags']) ? (op['tags'] as string[]) : [],
        deprecated: op['deprecated'] === true,
        parameters: [...parameters.values()],
        requestBody: body
          ? {
              required: body['required'] === true,
              description: text(body['description']),
              content: body['content'] ?? {},
              sourcePointer: `${sourcePointer}/requestBody`,
            }
          : null,
        responses: Object.entries(object(op['responses']))
          .sort(([a], [b]) => a.localeCompare(b, 'en'))
          .map(([status, value]) => {
            const r = resolve(value);
            return {
              status,
              description: text(r['description']) ?? '',
              content: r['content'] ?? {},
              headers: r['headers'] ?? {},
              sourcePointer: `${sourcePointer}/responses/${escape(status)}`,
            };
          }),
        security,
        servers: op['servers'] ?? item['servers'] ?? api['servers'] ?? [],
        sourcePointer,
      });
    }
  }
  if (operations.length > 2000)
    throw new SpecError(
      'COMPLEXITY',
      'Specifications may contain at most 2,000 operations.',
    );
  const info = object(api['info']);
  const components = object(api['components']);
  for (const requirement of Array.isArray(api['security'])
    ? api['security']
    : [])
    for (const name of Object.keys(object(requirement)))
      if (!Object.hasOwn(object(components['securitySchemes']), name))
        throw new SpecError(
          'SECURITY',
          'Global security requirement refers to an undeclared scheme.',
        );
  const knowledge: ApiKnowledge = {
    modelVersion: 1,
    title: text(info['title'])!,
    version: text(info['version'])!,
    description: text(info['description']),
    openapiVersion: version,
    servers: api['servers'] ?? [],
    tags: api['tags'] ?? [],
    globalSecurity: api['security'] ?? [],
    securitySchemes: components['securitySchemes'] ?? {},
    components,
    schemaCount: Object.keys(object(components['schemas'])).length,
    componentCount: Object.values(components).reduce<number>(
      (count, category) => count + Object.keys(object(category)).length,
      0,
    ),
    operations,
    references,
  };
  assertApiKnowledge(knowledge);
  return {
    format,
    filename,
    sourceBytes,
    sourceHash: createHash('sha256').update(source).digest('hex'),
    sourceDocument: document,
    knowledge,
  };
}
