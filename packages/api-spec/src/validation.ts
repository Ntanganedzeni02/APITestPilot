import AjvDraft4 from 'ajv-draft-04';
import Ajv2020 from 'ajv/dist/2020.js';
import { openapi } from '@apidevtools/openapi-schemas';

// Isolate vendor schemas; never mutate shared library objects.
const v31 = structuredClone(openapi.v31) as Record<string, unknown>;
// OAS 3.1 uses dynamic references to embed its schema dialect. Ajv needs the
// same replacement used by APIDevTools' validator; document schemas stay data.
const defs = v31['$defs'] as Record<string, Record<string, unknown>>;
const schema = defs['schema']!;
delete schema['$dynamicAnchor'];
const properties = (name: string) =>
  defs[name]!['properties'] as Record<string, Record<string, unknown>>;
properties('components')['schemas']!['additionalProperties'] = schema;
const header = defs['header']!['dependentSchemas'] as Record<
  string,
  Record<string, unknown>
>;
(header['schema']!['properties'] as Record<string, unknown>)['schema'] = schema;
properties('media-type')['schema'] = schema;
properties('parameter')['schema'] = schema;
const options = { strict: false, allErrors: false, validateFormats: false };
const v3 = new AjvDraft4.default(options).compile(structuredClone(openapi.v3));
const v3_1 = new Ajv2020.default(options).compile(v31);
export function validateDocument(value: unknown, version: string) {
  const validator = version.startsWith('3.1.') ? v3_1 : v3;
  if (validator(value)) return null;
  const error = validator.errors?.[0];
  // Paths and keywords only: vendor diagnostics may include imported content.
  return {
    pointer: error?.instancePath ?? '',
    keyword: error?.keyword ?? 'schema',
  };
}
