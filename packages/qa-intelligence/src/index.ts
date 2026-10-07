import {
  assertApiKnowledge,
  assertBehaviourGraph,
  assertQaContext,
  assertQaProposal,
  assertQaAnalysis,
  graphLogicalId,
  graphCompare,
  ValidationError,
  reviewState,
  type QaContext,
  type QaProposal,
  type QaAnalysisInput,
  type QaItem,
  type Json,
} from '@testpilot/domain';
import { createGraphIndex } from '@testpilot/behaviour-graph';
import {
  createAiEvidence,
  validateAiOutput,
  QA_PROMPT_VERSION,
  type QaIntelligenceProvider,
} from '@testpilot/ai';
export const QA_ENGINE_VERSION = '1.0.0';
export const requirementRules = {
  REQ_REQUIRED_PARAMETER: 'Required declared parameter',
  REQ_REQUIRED_BODY: 'Required declared request body',
  REQ_REQUIRED_PROPERTY: 'Required component property',
  REQ_SCHEMA_TYPE: 'Declared component/property type',
  REQ_SCHEMA_ENUM: 'Declared finite allowed values',
  REQ_RESPONSE_SCHEMA: 'Declared response schema reference',
  REQ_SECURITY: 'Effective declared security alternatives',
  REQ_IDENTIFIER_DEPENDENCY: 'Graph-proven compatible identifier dependency',
} as const;
export const riskRules = {
  RISK_DESTRUCTIVE: 'Graph-proven destructive resource operation',
  RISK_SECURITY_SURFACE:
    'Declared security coverage surface, not a vulnerability',
  RISK_COMPLEX_INPUT:
    'At least 8 required fields, nesting depth 4, or composition in declared request schema',
  RISK_DEPENDENCY: 'Identifier dependency/setup surface',
  RISK_STATE_SET: 'Possible resource state coverage, no transitions',
  RISK_AUTH_ALTERNATIVES: 'Multiple declared security alternatives',
  RISK_ERROR_GAP: 'Successful response but no declared 4xx/default response',
  RISK_UNSECURED_MUTATION:
    'Proven resource mutation with no security requirement or anonymous alternative in an otherwise secured API',
} as const;
const obj = (v: Json | undefined): Record<string, Json> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, Json>)
    : {};
const pointerPart = (s: string) =>
  s.replaceAll('~', '~0').replaceAll('/', '~1');
const sorted = (v: string[]) => [...new Set(v)].sort(graphCompare);
export function deriveQa(context: QaContext): QaAnalysisInput {
  assertQaContext(context);
  assertApiKnowledge(context.source.knowledge);
  assertBehaviourGraph(context.snapshot.graph);
  const { source, snapshot } = context;
  const k = source.knowledge,
    g = snapshot.graph,
    index = createGraphIndex(g);
  const proposals = new Map<string, QaProposal>();
  const requirementByNode = new Map<string, string[]>();
  function add(
    kind: QaProposal['kind'],
    ruleId: string,
    key: string,
    title: string,
    statement: string,
    category: string,
    pointers: string[],
    nodes: string[],
    edges: string[] = [],
    severity: QaProposal['severity'] = null,
  ) {
    const logicalKey = graphLogicalId(kind, ruleId, key);
    const sourceKind =
      ruleId === 'REQ_IDENTIFIER_DEPENDENCY' || kind === 'RISK'
        ? 'GRAPH_DERIVED'
        : 'SPEC_EXPLICIT';
    const item: QaProposal = {
      logicalKey,
      kind,
      title,
      statement,
      category,
      sourceKind,
      derivationType:
        sourceKind === 'SPEC_EXPLICIT' ? 'EXPLICIT' : 'DETERMINISTIC_INFERENCE',
      confidence: sourceKind === 'SPEC_EXPLICIT' ? 'EXACT' : 'STRONG',
      ruleId,
      reason:
        (kind === 'REQUIREMENT'
          ? requirementRules[ruleId as keyof typeof requirementRules]
          : riskRules[ruleId as keyof typeof riskRules]) +
        '; specification/structural evidence only, runtime behaviour is unverified.',
      sourcePointers: sorted(
        pointers.map((p) => (p.startsWith('#') ? p : '#' + p)),
      ),
      nodeRefs: sorted(nodes),
      edgeRefs: sorted(edges),
      requirementRefs: [],
      severity,
      priority:
        severity === 'CRITICAL'
          ? 'URGENT'
          : severity === 'HIGH'
            ? 'HIGH'
            : severity
              ? 'ROUTINE'
              : null,
    };
    assertQaProposal(item);
    proposals.set(logicalKey, item);
    if (kind === 'REQUIREMENT')
      for (const node of nodes)
        requirementByNode.set(node, [
          ...(requirementByNode.get(node) ?? []),
          logicalKey,
        ]);
    if (proposals.size > 1000)
      throw new ValidationError('Analysis exceeds 1,000 requirements/risks.');
  }
  const operations = new Map(
    g.nodes.filter((n) => n.type === 'OPERATION').map((n) => [n.label, n]),
  );
  const schemaNodes = new Map(
    g.nodes.filter((n) => n.type === 'SCHEMA').map((n) => [n.label, n]),
  );
  for (const op of k.operations) {
    const n = operations.get(op.key);
    if (!n) throw new ValidationError('Source graph operation mismatch.');
    for (const p of op.parameters.filter((p) => p.required))
      add(
        'REQUIREMENT',
        'REQ_REQUIRED_PARAMETER',
        graphLogicalId(op.key, p.location, p.name),
        'Required operation parameter',
        `${op.key} requires the ${p.name} ${p.location} parameter.`,
        'VALIDATION',
        [p.sourcePointer],
        [n.id],
      );
    if (op.requestBody?.required)
      add(
        'REQUIREMENT',
        'REQ_REQUIRED_BODY',
        op.key,
        'Required request body',
        `${op.key} requires a request body.`,
        'VALIDATION',
        [op.requestBody.sourcePointer],
        [n.id],
      );
    for (const response of op.responses) {
      const refs = new Set<string>();
      for (const media of Object.values(obj(response.content))) {
        const schema = obj(obj(media)['schema']);
        const ref = schema['$ref'] ?? obj(schema['items'])['$ref'];
        if (typeof ref === 'string' && ref.startsWith('#/components/schemas/'))
          refs.add(ref);
      }
      for (const ref of refs) {
        const schemaName = ref
          .slice('#/components/schemas/'.length)
          .replaceAll('~1', '/')
          .replaceAll('~0', '~');
        const schema = schemaNodes.get(schemaName);
        if (schema)
          add(
            'REQUIREMENT',
            'REQ_RESPONSE_SCHEMA',
            graphLogicalId(op.key, response.status, ref),
            'Declared response contract',
            `${op.key} declares response ${response.status} using schema ${schemaName}.`,
            'DATA_CONTRACT',
            [response.sourcePointer, ref],
            [n.id, schema.id],
          );
      }
    }
    const security = Array.isArray(op.security) ? op.security : [];
    if (security.some((s) => Object.keys(obj(s)).length))
      add(
        'REQUIREMENT',
        'REQ_SECURITY',
        op.key,
        'Declared security contract',
        `${op.key} declares ${security.length} security alternative(s)${security.some((s) => Object.keys(obj(s)).length === 0) ? ', including anonymous access' : ''}. Preserve the declared alternative/conjunction semantics.`,
        'SECURITY',
        [op.sourcePointer],
        [n.id],
        index
          .outgoing(n.id)
          .filter((e) => e.type === 'OPERATION_REQUIRES_SECURITY')
          .map((e) => e.id),
      );
    if (security.some((s) => Object.keys(obj(s)).length))
      add(
        'RISK',
        'RISK_SECURITY_SURFACE',
        op.key,
        'Security coverage surface',
        `${op.key} declares security requirements. Test accepted and rejected credentials across declared alternatives; this is not evidence of a vulnerability.`,
        'AUTHENTICATION',
        [op.sourcePointer],
        [n.id],
        [],
        'MEDIUM',
      );
    if (security.length > 1)
      add(
        'RISK',
        'RISK_AUTH_ALTERNATIVES',
        op.key,
        'Authentication alternative coverage',
        `${op.key} declares ${security.length} security alternatives; each path needs deliberate coverage.`,
        'AUTHENTICATION',
        [op.sourcePointer],
        [n.id],
        [],
        'MEDIUM',
      );
    if (
      op.responses.some((r) => /^2(?:\d\d|XX)$/.test(r.status)) &&
      !op.responses.some(
        (r) => /^4(?:\d\d|XX)$/.test(r.status) || r.status === 'default',
      )
    )
      add(
        'RISK',
        'RISK_ERROR_GAP',
        op.key,
        'Missing declared client-error coverage',
        `${op.key} declares success responses but no 4xx or default response. This is a specification coverage gap, not proof of incorrect runtime error handling.`,
        'ERROR_HANDLING',
        [op.sourcePointer],
        [n.id],
        [],
        'LOW',
      );
    if (op.requestBody) {
      let required = 0,
        maxDepth = 0,
        composition = false,
        visited = 0;
      const seen = new Set<string>();
      const walk = (v: Json | undefined, depth = 0) => {
        if (++visited > 5000 || depth > 32)
          throw new ValidationError(
            'Input complexity exceeds bounded analysis traversal.',
          );
        const s = obj(v);
        maxDepth = Math.max(maxDepth, depth);
        if (Array.isArray(s['required'])) required += s['required'].length;
        if (s['allOf'] || s['oneOf'] || s['anyOf']) composition = true;
        const ref = s['$ref'];
        if (
          typeof ref === 'string' &&
          ref.startsWith('#/components/schemas/') &&
          !seen.has(ref)
        ) {
          seen.add(ref);
          walk(
            obj(obj(k.components)['schemas'])[
              ref.slice(21).replaceAll('~1', '/').replaceAll('~0', '~')
            ],
            depth,
          );
        }
        for (const child of Object.values(obj(s['properties'])))
          walk(child, depth + 1);
        if (s['items']) walk(s['items'], depth + 1);
      };
      for (const media of Object.values(obj(op.requestBody.content)))
        walk(obj(media)['schema']);
      if (required >= 8 || maxDepth >= 4 || composition)
        add(
          'RISK',
          'RISK_COMPLEX_INPUT',
          op.key,
          'Request contract complexity',
          `${op.key} declares a request contract with ${required} required-field occurrences, nesting depth ${maxDepth}${composition ? ' and composition' : ''}. This expands validation coverage; no runtime failure is asserted.`,
          'CONTRACT_COMPLEXITY',
          [op.requestBody.sourcePointer],
          [n.id],
          [],
          'MEDIUM',
        );
    }
  }
  const components = obj(obj(k.components)['schemas']);
  for (const [name, value] of Object.entries(components)) {
    const n = schemaNodes.get(name);
    if (!n) continue;
    const root = `#/components/schemas/${pointerPart(name)}`,
      schema = obj(value);
    if (Array.isArray(schema['required']))
      for (const property of schema['required'])
        if (typeof property === 'string')
          add(
            'REQUIREMENT',
            'REQ_REQUIRED_PROPERTY',
            graphLogicalId(name, property),
            'Required schema property',
            `${name} requires property ${property}.`,
            'VALIDATION',
            [root + '/required'],
            [n.id],
          );
    for (const [property, definition] of [
      ['', value],
      ...Object.entries(obj(schema['properties'])),
    ] as [string, Json][]) {
      const field = obj(definition);
      const base =
        root + (property ? `/properties/${pointerPart(property)}` : '');
      const label = property ? `${name}.${property}` : name;
      if (typeof field['type'] === 'string' || Array.isArray(field['type']))
        add(
          'REQUIREMENT',
          'REQ_SCHEMA_TYPE',
          graphLogicalId(name, property),
          'Declared schema type',
          `${label} must satisfy declared type ${JSON.stringify(field['type'])}.`,
          'DATA_CONTRACT',
          [base + '/type'],
          [n.id],
        );
      if (
        Array.isArray(field['enum']) &&
        field['enum'].length > 0 &&
        field['enum'].length <= 30
      )
        add(
          'REQUIREMENT',
          'REQ_SCHEMA_ENUM',
          graphLogicalId(name, property),
          'Declared allowed values',
          `${label} must use one of the declared enum values: ${JSON.stringify(field['enum'])}.`,
          'DATA_CONTRACT',
          [base + '/enum'],
          [n.id],
        );
    }
  }
  const secured = k.operations.some(
    (o) =>
      Array.isArray(o.security) &&
      o.security.some((s) => Object.keys(obj(s)).length),
  );
  for (const edge of g.edges) {
    const before = index.nodes.get(edge.from)!,
      after = index.nodes.get(edge.to)!;
    const p = edge.provenance.sourcePointers;
    if (edge.type === 'OPERATION_PRECEDES_OPERATION') {
      add(
        'REQUIREMENT',
        'REQ_IDENTIFIER_DEPENDENCY',
        edge.id,
        'Structural identifier dependency',
        `${after.label} consumes an identifier structurally compatible with an identifier produced by ${before.label}. This does not prove mandatory runtime execution order.`,
        'DEPENDENCY',
        p,
        [before.id, after.id],
        [edge.id],
      );
      add(
        'RISK',
        'RISK_DEPENDENCY',
        edge.id,
        'Identifier setup dependency',
        `${after.label} has a graph-proven identifier compatibility dependency on ${before.label}; test setup must account for identifiers without assuming runtime order.`,
        'DEPENDENCY',
        p,
        [before.id, after.id],
        [edge.id],
        'MEDIUM',
      );
    }
    if (edge.type === 'OPERATION_DELETES_RESOURCE')
      add(
        'RISK',
        'RISK_DESTRUCTIVE',
        edge.id,
        'Destructive-operation testing surface',
        `${before.label} structurally deletes ${after.label}. Authorization, negative-path and recovery-oriented coverage needs review; no execution has occurred.`,
        'DESTRUCTIVE_OPERATION',
        p,
        [before.id, after.id],
        [edge.id],
        'HIGH',
      );
    if (
      secured &&
      [
        'OPERATION_CREATES_RESOURCE',
        'OPERATION_UPDATES_RESOURCE',
        'OPERATION_DELETES_RESOURCE',
      ].includes(edge.type)
    ) {
      const op = k.operations.find((o) => o.key === before.label)!;
      const security = Array.isArray(op.security) ? op.security : [];
      if (!security.length || security.some((s) => !Object.keys(obj(s)).length))
        add(
          'RISK',
          'RISK_UNSECURED_MUTATION',
          edge.id,
          'Mutation without mandatory declared security',
          `${before.label} has no mandatory OpenAPI security requirement while other API operations declare security. Review the specification and intended exposure; this is not a vulnerability finding.`,
          'AUTHORIZATION',
          p,
          [before.id, after.id],
          [edge.id],
          'MEDIUM',
        );
    }
  }
  const states = new Map<string, typeof g.edges>();
  for (const e of g.edges.filter((e) => e.type === 'STATE_BELONGS_TO_RESOURCE'))
    states.set(e.to, [...(states.get(e.to) ?? []), e]);
  for (const [resource, edges] of states) {
    const n = index.nodes.get(resource)!;
    add(
      'RISK',
      'RISK_STATE_SET',
      resource,
      'Possible-state coverage surface',
      `${n.label} has ${edges.length} declared possible state values. Cover the declared values; transitions and preconditions are unknown.`,
      'STATE_MANAGEMENT',
      sorted(edges.flatMap((e) => e.provenance.sourcePointers)),
      [
        resource,
        ...index
          .outgoing(resource)
          .filter((e) => e.type === 'RESOURCE_USES_SCHEMA')
          .map((e) => e.to),
      ],
      edges.map((e) => e.id),
      'MEDIUM',
    );
  }
  const items = [...proposals.values()].sort((a, b) =>
    graphCompare(a.logicalKey, b.logicalKey),
  );
  for (const item of items)
    if (item.kind === 'RISK')
      item.requirementRefs = sorted(
        item.nodeRefs.flatMap((n) => requirementByNode.get(n) ?? []),
      ).slice(0, 30);
  const input: QaAnalysisInput = {
    workspaceId: source.workspaceId,
    projectId: source.projectId,
    importId: source.id,
    graphId: snapshot.id,
    engineVersion: QA_ENGINE_VERSION,
    aiStatus: 'NOT_CONFIGURED',
    aiMetadata: null,
    aiFailure: null,
    items,
  };
  assertQaAnalysis(input);
  return input;
}
export async function analyzeQa(
  context: QaContext,
  provider: QaIntelligenceProvider | null = null,
  timeoutMs = 10000,
): Promise<QaAnalysisInput> {
  const deterministic = deriveQa(context);
  if (!provider) return deterministic;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const catalog = createAiEvidence(context);
    const raw = await Promise.race([
      provider.analyze(catalog.request, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('timeout'));
        }, timeoutMs);
      }),
    ]);
    const proposals = validateAiOutput(raw, catalog);
    for (const p of proposals) assertQaProposal(p);
    const result: QaAnalysisInput = {
      ...deterministic,
      aiStatus: 'SUCCEEDED',
      aiFailure: null,
      aiMetadata: {
        provider: provider.providerId,
        model: provider.modelId,
        promptVersion: QA_PROMPT_VERSION,
        analysisVersion: QA_ENGINE_VERSION,
        validated: true,
        completedAt: new Date().toISOString(),
        inputEvidence: [...catalog.refs.keys()],
      },
      items: [...deterministic.items, ...proposals],
    };
    assertQaAnalysis(result);
    return result;
  } catch {
    return {
      ...deterministic,
      aiStatus: 'FAILED',
      aiFailure:
        'AI analysis unavailable or invalid; deterministic results are preserved.',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export function itemsForNode(
  items: QaItem[],
  nodeId: string,
  kind?: QaProposal['kind'],
) {
  return items.filter(
    (i) => (!kind || i.kind === kind) && i.nodeRefs.includes(nodeId),
  );
}
export function risksForRequirement(items: QaItem[], key: string) {
  return items.filter(
    (i) => i.kind === 'RISK' && i.requirementRefs.includes(key),
  );
}
export function itemsBySourcePointer(items: QaItem[], pointer: string) {
  return items.filter((i) => i.sourcePointers.includes(pointer));
}
export function itemsByStatus(
  items: QaItem[],
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED',
) {
  return items.filter((i) => reviewState(i).status === status);
}
// Structural associations only; following a schema reference does not prove
// execution order, ownership or a state transition.
export function requirementsForOperation(
  items: QaItem[],
  graph: QaContext['snapshot']['graph'],
  operationId: string,
) {
  return relatedItems(items, graph, operationId, 'REQUIREMENT');
}
export function requirementsForResource(
  items: QaItem[],
  graph: QaContext['snapshot']['graph'],
  resourceId: string,
) {
  return relatedItems(items, graph, resourceId, 'REQUIREMENT');
}
export function requirementsForSchema(items: QaItem[], schemaId: string) {
  return itemsForNode(items, schemaId, 'REQUIREMENT');
}
export function risksForOperation(
  items: QaItem[],
  graph: QaContext['snapshot']['graph'],
  operationId: string,
) {
  return relatedItems(items, graph, operationId, 'RISK');
}
export function risksForResource(
  items: QaItem[],
  graph: QaContext['snapshot']['graph'],
  resourceId: string,
) {
  return relatedItems(items, graph, resourceId, 'RISK');
}
function relatedItems(
  items: QaItem[],
  graph: QaContext['snapshot']['graph'],
  id: string,
  kind: QaProposal['kind'],
) {
  const index = createGraphIndex(graph),
    refs = new Set([id]);
  if (index.nodes.get(id)?.type === 'RESOURCE')
    for (const e of index.incoming(id))
      if (index.nodes.get(e.from)?.type === 'OPERATION') refs.add(e.from);
  const queue = [...refs];
  for (let n = 0; n < queue.length; n++)
    for (const e of index.outgoing(queue[n]!)) {
      if (
        [
          'OPERATION_HAS_PARAMETER',
          'OPERATION_ACCEPTS_REQUEST',
          'OPERATION_RETURNS_RESPONSE',
          'OPERATION_REQUIRES_SECURITY',
          'REQUEST_USES_SCHEMA',
          'RESPONSE_USES_SCHEMA',
          'PARAMETER_USES_SCHEMA',
          'SCHEMA_REFERENCES_SCHEMA',
        ].includes(e.type) &&
        !refs.has(e.to)
      ) {
        refs.add(e.to);
        queue.push(e.to);
      }
    }
  return items.filter(
    (item) => item.kind === kind && item.nodeRefs.some((ref) => refs.has(ref)),
  );
}

export const approvedRequirements = (items: QaItem[]) =>
  itemsByStatus(items, 'APPROVED').filter((i) => i.kind === 'REQUIREMENT');
export const rejectedRequirements = (items: QaItem[]) =>
  itemsByStatus(items, 'REJECTED').filter((i) => i.kind === 'REQUIREMENT');
export const unresolvedProposals = (items: QaItem[]) =>
  itemsByStatus(items, 'PROPOSED');
export const itemsForEdge = (items: QaItem[], edgeId: string) =>
  items.filter((i) => i.edgeRefs.includes(edgeId));
