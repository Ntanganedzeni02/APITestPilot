import { AiValidationError, type ReferenceCategory } from './diagnostics.js';
import {
  assertQaContext,
  containsRecognizableCredential,
  ValidationError,
  type Json,
  type PlanningContext,
} from '@testpilot/domain';
import { planningAiCatalog, validatePlanningAi } from './test-planning.js';
function publicText(value: string, limit = 120) {
  if (
    containsRecognizableCredential(value) ||
    /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/.test(
      value,
    ) ||
    /https?:\/\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)
  )
    return '[WITHHELD]';
  return [...value]
    .map((character) => (character.charCodeAt(0) < 32 ? ' ' : character))
    .join('')
    .slice(0, limit);
}
// Select only declared structural constraints. Drop descriptions, examples, defaults,
// servers, headers, all observed values, string enum literals and authentication material.
export function schemaShape(value: Json, depth = 0): Json {
  if (depth > 3 || !value || typeof value !== 'object' || Array.isArray(value))
    return null;
  const result: Record<string, Json> = {};
  for (const key of ['type', 'format'])
    if (
      typeof value[key] === 'string' &&
      [
        'string',
        'integer',
        'number',
        'boolean',
        'object',
        'array',
        'null',
        'date',
        'date-time',
        'uuid',
        'email',
        'hostname',
        'ipv4',
        'ipv6',
        'uri',
        'uri-reference',
        'int32',
        'int64',
        'float',
        'double',
        'binary',
        'byte',
        'password',
      ].includes(value[key])
    )
      result[key] = value[key];
  for (const key of [
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
  ])
    if (typeof value[key] === 'number' && Number.isFinite(value[key]))
      result[key] = value[key];
  if (Array.isArray(value['enum'])) result['enumCount'] = value['enum'].length;
  if (Array.isArray(value['required']))
    result['required'] = value['required']
      .filter((v) => typeof v === 'string')
      .slice(0, 12)
      .map((v) => publicText(v as string, 64));
  const props = value['properties'];
  if (props && typeof props === 'object' && !Array.isArray(props))
    result['properties'] = Object.fromEntries(
      Object.entries(props)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .slice(0, 12)
        .map(([k, v]) => [publicText(k, 64), schemaShape(v, depth + 1)]),
    );
  if (value['items']) result['items'] = schemaShape(value['items'], depth + 1);
  return result;
}
function contentShapes(content: Json): Json[] {
  if (!content || typeof content !== 'object' || Array.isArray(content))
    return [];
  return Object.entries(content)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 3)
    .map(([, value]) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? schemaShape(value['schema'] ?? null)
        : null,
    );
}
export function groundedPlanningCatalog(context: PlanningContext) {
  assertQaContext(context);
  if (
    context.analysis.workspaceId !== context.source.workspaceId ||
    context.analysis.projectId !== context.source.projectId ||
    context.analysis.importId !== context.source.id ||
    context.analysis.graphId !== context.snapshot.id
  )
    throw new ValidationError('Planning scope mismatch.');
  const catalog = planningAiCatalog(context);
  const operations = [...catalog.evidence]
    .filter(([, node]) => node.type === 'OPERATION')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(0, 12)
    .flatMap(([token, node]) => {
      const parts = JSON.parse(node.id) as string[];
      const operation = context.source.knowledge.operations.find(
        (op) => op.key === parts[1],
      );
      if (!operation) return [];
      return [
        {
          token,
          method: operation.method,
          route: publicText(operation.path),
          parameters: operation.parameters.slice(0, 8).map((p) => ({
            location: p.location,
            required: p.required,
            schema: schemaShape(p.schema),
          })),
          requestRequired: operation.requestBody?.required ?? false,
          requestSchemas: contentShapes(operation.requestBody?.content ?? null),
          responseSchemas: operation.responses.slice(0, 10).map((response) => ({
            status: response.status,
            schemas: contentShapes(response.content),
          })),
          securityRequired:
            Array.isArray(operation.security) && operation.security.length > 0,
          responseStatuses: operation.responses
            .map((r) => r.status)
            .filter((s) => /^[1-5][0-9Xx]{2}$/.test(s))
            .slice(0, 10),
        },
      ];
    });
  const requirements = catalog.request.data.requirements
      .slice(0, 20)
      .map((r) => ({ ...r, category: publicText(r.category, 80) })),
    risks = catalog.request.data.risks
      .slice(0, 20)
      .map((r) => ({ ...r, category: publicText(r.category, 80) }));
  if (!operations.length || !requirements.length)
    throw new ValidationError(
      'Approved requirements and grounded operations are required for AI planning.',
    );
  const data = {
    requirements,
    risks,
    evidence: operations.map((o) => ({ token: o.token, type: 'OPERATION' })),
    operations,
  };
  return {
    ...catalog,
    request: {
      ...catalog.request,
      instructions:
        catalog.request.instructions +
        ' Propose between 1 and 10 items. EVERY proposal, including scenarios, must cite at least one supplied requirement token and operation token. Use only supplied opaque tokens in references, never IDs or route strings. Scenario proposals use scenarioRef=null and caseType=null. Cases use the exact key of an earlier scenario and a non-null supplied caseType enum. Keys are unique; emit scenarios before their cases. Every case requirementRefs must be a subset of its parent scenario requirementRefs. Respect the schema objective length limit; requestIntent is appended separately. All required text fields must be non-empty. Keep objectives distinct. Use declared constraints only; state uncertainty rather than inventing semantics. Preconditions are AUTH_REQUIRED or APPROVED_TEST_DATA. Request intent is review-only prose, never URLs, payloads or runnable code.',
      data,
    },
    operations,
  };
}
export function validateGroundedPlanning(
  raw: unknown,
  catalog: ReturnType<typeof groundedPlanningCatalog>,
) {
  const fail = (rule: string, category: ReferenceCategory = 'NONE') => {
    throw new AiValidationError('GROUNDING', rule, category);
  };
  if (
    !raw ||
    typeof raw !== 'object' ||
    !Array.isArray((raw as { proposals?: unknown }).proposals)
  )
    return fail('PROPOSAL_STRUCTURE');
  const root = raw as { proposals: Record<string, unknown>[] };
  if (root.proposals.length === 0 || root.proposals.length > 10)
    return fail('PROPOSAL_COUNT');
  const texts = new Set<string>();
  for (const p of root.proposals) {
    const refs = p['evidenceRefs'];
    if (
      !Array.isArray(refs) ||
      !refs.length ||
      refs.some((r) => !catalog.operations.some((o) => o.token === r))
    )
      return fail('OPERATION_REFERENCE', 'OPERATION');
    for (const name of ['requirementRefs', 'riskRefs']) {
      const values = p[name],
        supplied =
          catalog.request.data[
            name === 'requirementRefs' ? 'requirements' : 'risks'
          ];
      if (
        !Array.isArray(values) ||
        values.some((v) => !supplied.some((s) => s.token === v))
      )
        return fail(
          'SUPPLIED_REFERENCE',
          name === 'requirementRefs' ? 'REQUIREMENT' : 'RISK',
        );
    }
    const text = JSON.stringify(p);
    if (
      containsRecognizableCredential(text) ||
      /\bsk-[A-Za-z0-9_-]{20,}\b/.test(text) ||
      /https?:\/\/|\bcurl\b|\bDROP TABLE\b|\b(?:eval|exec)\s*\(/i.test(text)
    )
      return fail('UNSAFE_CONTENT');
    const key =
      String(p['title']).trim().toLowerCase() +
      '|' +
      String(p['objective']).trim().toLowerCase();
    if (texts.has(key)) return fail('DUPLICATE_OBJECTIVE');
    texts.add(key);
    const statuses = catalog.operations
      .filter((o) => refs.includes(o.token))
      .flatMap((o) => o.responseStatuses);
    for (const match of text.matchAll(
      /\b(?:HTTP|status(?: code)?)\s*[:=]?\s*([1-5]\d{2})\b/gi,
    ))
      if (!statuses.includes(match[1]!)) return fail('UNDECLARED_HTTP_STATUS');
  }
  return validatePlanningAi(raw, catalog);
}
