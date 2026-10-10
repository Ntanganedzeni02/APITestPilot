import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  parseApiSpec,
  MAX_SPEC_BYTES,
  SpecError,
  formatForFilename,
} from '../src/index.js';
const source = readFileSync(
  'packages/api-spec/tests/fixtures/catalog.json',
  'utf8',
);
const fixture = () => JSON.parse(source);
describe('deterministic OpenAPI knowledge', () => {
  it('rejects duplicate JSON keys rather than overwriting silently', () => {
    expect(() =>
      parseApiSpec('{"openapi":"3.0.3","openapi":"3.1.0"}', 'json'),
    ).toThrow('Invalid JSON');
  });
  it('rejects schema reference scopes it cannot interpret safely', () => {
    const f = fixture();
    f.components.schemas.Item.$id = 'https://example.invalid/schema';
    expect(() => parseApiSpec(JSON.stringify(f), 'json')).toThrow('Schema IDs');
  });
  it('normalizes 3.0 JSON with operations, inheritance, security and source pointers', () => {
    const k = parseApiSpec(source, 'json').knowledge;
    expect(k.operations.map((o) => o.key)).toEqual([
      'GET /items',
      'POST /items',
      'GET /items/{id}',
    ]);
    expect(k.operations[0]?.parameters[0]).toMatchObject({
      name: 'limit',
      location: 'query',
      required: false,
    });
    expect(k.operations[2]?.parameters[0]).toMatchObject({
      name: 'id',
      location: 'path',
      required: true,
    });
    expect(k.operations[0]?.responses.map((r) => r.status)).toEqual([
      '200',
      'default',
    ]);
    expect(k.operations[1]?.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/Item' } },
      },
    });
    expect(k.operations[0]?.security).toEqual([{ bearerAuth: [] }]);
    expect(k.operations[1]?.security).toEqual([]);
    expect(k.schemaCount).toBe(1);
    expect(k.references).toContainEqual({
      sourcePointer: '/components/schemas/Item/properties/related/$ref',
      targetPointer: '#/components/schemas/Item',
    });
    expect(parseApiSpec(source, 'json')).toEqual(parseApiSpec(source, 'json'));
  });
  it('parses YAML and preserves local schema references', () => {
    const k = parseApiSpec(
      readFileSync('packages/api-spec/tests/fixtures/catalog.yaml', 'utf8'),
      'yaml',
    ).knowledge;
    expect(k.title).toContain('YAML');
    expect(k.operations).toHaveLength(1);
    expect(k.references).toHaveLength(1);
  });
  it('validates 3.1 JSON Schema nullable unions and boolean schemas', () => {
    const f = fixture();
    f.openapi = '3.1.1';
    f.components.schemas.Nullable = { type: ['string', 'null'] };
    f.components.schemas.Any = true;
    expect(parseApiSpec(JSON.stringify(f), 'json').knowledge.schemaCount).toBe(
      3,
    );
  });
  it('strips example payloads and retains schema properties named example', () => {
    const result = parseApiSpec(source, 'json');
    expect(JSON.stringify(result)).not.toContain('must-not-be-stored');
    expect(JSON.stringify(result.knowledge.components)).toContain(
      '"example":{"type":"string"}',
    );
  });
  it.each([
    ['{oops', 'json', 'SYNTAX'],
    ['openapi: [oops', 'yaml', 'SYNTAX'],
    ['{"hello":true}', 'json', 'NOT_OPENAPI'],
    ['{"swagger":"2.0"}', 'json', 'VERSION'],
    ['{"openapi":"4.0.0"}', 'json', 'VERSION'],
    ['{"openapi":"3.0.3"}', 'json', 'STRUCTURE'],
  ] as const)('rejects invalid input category %s', (input, format, code) => {
    expect(() => parseApiSpec(input, format)).toThrow(SpecError);
    try {
      parseApiSpec(input, format);
    } catch (e) {
      expect(e).toMatchObject({ code });
    }
  });
  it.each([
    'https://example.invalid/schema',
    'file:///etc/passwd',
    '../schema.json',
    '#anchor',
  ])('rejects external or unsupported reference %s', (ref) => {
    const f = fixture();
    f.components.schemas.Item.properties.related.$ref = ref;
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(() => parseApiSpec(JSON.stringify(f), 'json')).toThrow(
      'references are unsupported',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects missing references even in unused components', () => {
    const f = fixture();
    f.components.schemas.Item.properties.related.$ref =
      '#/components/schemas/Missing';
    expect(() => parseApiSpec(JSON.stringify(f), 'json')).toThrow('Unresolved');
  });
  it('rejects duplicate operation IDs and templated paths', () => {
    const f = fixture();
    f.paths['/items'].post.operationId = 'listItems';
    expect(() => parseApiSpec(JSON.stringify(f), 'json')).toThrow('Duplicate');
    delete f.paths['/items'].post.operationId;
    f.paths['/items/{other}'] = f.paths['/items/{id}'];
    expect(() => parseApiSpec(JSON.stringify(f), 'json')).toThrow('Duplicate');
  });
  it('rejects mismatched path parameters', () => {
    const f = fixture();
    f.paths['/items/{id}'].parameters = [];
    expect(() => parseApiSpec(JSON.stringify(f), 'json')).toThrow(
      'path placeholder',
    );
  });
  it('rejects undeclared security schemes', () => {
    const f = fixture();
    f.security = [{ missing: [] }];
    expect(() => parseApiSpec(JSON.stringify(f), 'json')).toThrow('undeclared');
  });
  it('rejects excessive bytes and YAML aliases / duplicate keys', () => {
    expect(() => parseApiSpec(' '.repeat(MAX_SPEC_BYTES + 1), 'json')).toThrow(
      '2 MiB',
    );
    expect(() => parseApiSpec('a: &a [x]\nb: *a', 'yaml')).toThrow(
      'Invalid YAML',
    );
    expect(() => parseApiSpec('a: 1\na: 2', 'yaml')).toThrow('Invalid YAML');
  });
  it('rejects credential-bearing server URLs', () => {
    const f = fixture();
    f.servers[0].url = 'https://user:secret@example.invalid';
    expect(() => parseApiSpec(JSON.stringify(f), 'json')).toThrow(
      'credentials',
    );
  });
  it('allows only intended file extensions, independent of MIME', () => {
    expect(formatForFilename('spec.YML')).toBe('yaml');
    expect(() => formatForFilename('spec.html')).toThrow('Upload');
  });
});
