import {
  assertApiKnowledge,
  assertBehaviourGraph,
  graphLogicalId,
  graphCompare,
  MAX_GRAPH_NODES,
  MAX_GRAPH_EDGES,
  ValidationError,
  type ApiImportSummary,
  type Json,
  type GraphNode,
  type GraphEdge,
  type GraphNodeType,
  type GraphEdgeType,
  type GraphProvenance,
  type BehaviourGraph,
} from '@testpilot/domain';

export const GRAPH_BUILDER_VERSION = '1.0.0';
export const graphRules = {
  DECLARED_STRUCTURE:
    'Declared OpenAPI structure. Schema use records local references (including nested references), not runtime instances.',
  SECURITY_REQUIREMENT:
    'Declared effective security alternatives; edges carry alternative group evidence, not unconditional AND semantics.',
  DECLARED_SCOPE:
    'Explicitly declared and referenced OAuth2 scope. An actor denotes a capability, not a person or login endpoint.',
  RESOURCE_PATH_SCHEMA:
    'Canonical terminal path exactly matches lowercased schema name or name+s. Two operations share a direct successful response schema. Action paths excluded.',
  CRUD_CORROBORATED:
    'Method plus collection/item shape and matching successful resource response. Item requires compatible identifier; DELETE requires empty successful response. Specification intent only.',
  IDENTIFIER_EXACT:
    'Required primitive id or resource-name+Id property matches a required path parameter id or resource-name+Id, exact normalized name/type/format and same resource. Ambiguous matches excluded.',
  IDENTIFIER_DEPENDENCY:
    'Corroborated collection create produces the same identifier consumed by an item operation. Structural compatibility, not proven runtime order.',
  STATUS_ENUM:
    'Direct string status/state property with 2–30 unique string enum values. Possible values only; transitions and preconditions unknown.',
} as const;
export type GraphRuleId = keyof typeof graphRules;
const obj = (v: Json | undefined): Record<string, Json> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, Json>)
    : {};
const ptr = (s: string) => s.replaceAll('~', '~0').replaceAll('/', '~1');
const schemaPointer = (name: string) => `#/components/schemas/${ptr(name)}`;
const sorted = (v: string[]) => [...new Set(v)].sort(graphCompare);
const canonicalJson = (value: Json): string =>
  JSON.stringify(
    Array.isArray(value)
      ? value.map((v) => JSON.parse(canonicalJson(v)) as Json)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => graphCompare(a, b))
              .map(([key, v]) => [key, JSON.parse(canonicalJson(v)) as Json]),
          )
        : value,
  );
const actionSegments = new Set([
  'search',
  'login',
  'logout',
  'authenticate',
  'refresh',
  'activate',
  'deactivate',
  'cancel',
  'send',
  'export',
  'import',
  'validate',
  'execute',
  'run',
]);

export function buildBehaviourGraph(source: ApiImportSummary): BehaviourGraph {
  assertApiKnowledge(source.knowledge);
  const k = source.knowledge;
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const provenance = (
    ruleId: GraphRuleId,
    pointers: string[],
    evidence: string[],
  ): GraphProvenance => ({
    importId: source.id,
    ruleId,
    sourcePointers: sorted(
      pointers.map((p) => (p.startsWith('#') ? p : `#${p}`)),
    ),
    evidence: sorted(evidence),
    derivation: [
      'DECLARED_STRUCTURE',
      'SECURITY_REQUIREMENT',
      'DECLARED_SCOPE',
    ].includes(ruleId)
      ? 'EXPLICIT'
      : 'DETERMINISTIC_INFERENCE',
    confidence: [
      'DECLARED_STRUCTURE',
      'SECURITY_REQUIREMENT',
      'DECLARED_SCOPE',
    ].includes(ruleId)
      ? 'EXACT'
      : 'STRONG',
  });
  const merge = (a: GraphProvenance, b: GraphProvenance): GraphProvenance => ({
    ...a,
    sourcePointers: sorted([...a.sourcePointers, ...b.sourcePointers]),
    evidence: sorted([...a.evidence, ...b.evidence]),
  });
  function node(
    type: GraphNodeType,
    key: string,
    label: string,
    p: GraphProvenance,
  ) {
    const id = graphLogicalId(type, key);
    const old = nodes.get(id);
    nodes.set(id, {
      id,
      type,
      label,
      provenance: old ? merge(old.provenance, p) : p,
    });
    if (nodes.size > MAX_GRAPH_NODES)
      throw new ValidationError('Graph exceeds 12,000 nodes.');
    return id;
  }
  function edge(
    type: GraphEdgeType,
    from: string,
    to: string,
    p: GraphProvenance,
  ) {
    const id = graphLogicalId(type, from, to);
    const old = edges.get(id);
    edges.set(id, {
      id,
      type,
      from,
      to,
      provenance: old ? merge(old.provenance, p) : p,
    });
    if (edges.size > MAX_GRAPH_EDGES)
      throw new ValidationError('Graph exceeds 30,000 edges.');
  }
  const explicit = (p: string[], e: string[]) =>
    provenance('DECLARED_STRUCTURE', p, e);
  const api = node(
    'API',
    'root',
    k.title,
    explicit(['#/info'], ['API metadata']),
  );
  const schemas = obj(obj(k.components)['schemas']);
  const schemaIds = new Map<string, string>();
  for (const name of Object.keys(schemas).sort(graphCompare))
    schemaIds.set(
      schemaPointer(name),
      node(
        'SCHEMA',
        schemaPointer(name),
        name,
        explicit([schemaPointer(name)], [`Schema ${name}`]),
      ),
    );
  function refs(value: Json | undefined): string[] {
    const found = new Set<string>();
    let count = 0;
    function walk(v: Json | undefined, depth = 0) {
      if (++count > 50000 || depth > 64)
        throw new ValidationError(
          'Graph schema traversal exceeds structural limits.',
        );
      if (!v || typeof v !== 'object') return;
      const r = obj(v)['$ref'];
      if (typeof r === 'string' && schemaIds.has(r)) found.add(r);
      for (const child of Object.values(v)) walk(child, depth + 1);
    }
    walk(value);
    return [...found].sort(graphCompare);
  }
  const direct = (value: Json | undefined): string[] => {
    const s = obj(value);
    const ref = s['$ref'];
    if (typeof ref === 'string' && schemaIds.has(ref)) return [ref];
    if (s['type'] === 'array') {
      const item = obj(s['items'])['$ref'];
      if (typeof item === 'string' && schemaIds.has(item)) return [item];
    }
    return [];
  };
  const contentDirect = (content: Json) =>
    sorted(
      Object.values(obj(content)).flatMap((media) =>
        direct(obj(media)['schema']),
      ),
    );
  function schemaUse(
    from: string,
    kind:
      'PARAMETER_USES_SCHEMA' | 'REQUEST_USES_SCHEMA' | 'RESPONSE_USES_SCHEMA',
    value: Json | undefined,
    sourcePointer: string,
    key: string,
  ) {
    if (value === undefined || value === null) return;
    const found = refs(value);
    for (const r of found)
      edge(
        kind,
        from,
        schemaIds.get(r)!,
        explicit([sourcePointer, r], [`Local schema reference ${r}`]),
      );
    if (typeof obj(value)['$ref'] === 'string') return;
    const p = explicit(
      [sourcePointer],
      [`Inline schema at normalized location ${key}`],
    );
    const inline = node(
      'SCHEMA',
      graphLogicalId('inline', key),
      `Inline schema: ${key}`,
      p,
    );
    edge(kind, from, inline, p);
    for (const r of found)
      edge(
        'SCHEMA_REFERENCES_SCHEMA',
        inline,
        schemaIds.get(r)!,
        explicit([sourcePointer, r], [`Nested local schema reference ${r}`]),
      );
  }
  function contentUse(
    from: string,
    kind:
      'PARAMETER_USES_SCHEMA' | 'REQUEST_USES_SCHEMA' | 'RESPONSE_USES_SCHEMA',
    content: Json,
    sourcePointer: string,
    key: string,
  ) {
    for (const [media, value] of Object.entries(obj(content)))
      schemaUse(
        from,
        kind,
        obj(value)['schema'],
        sourcePointer,
        graphLogicalId(key, media),
      );
  }
  for (const [name, value] of Object.entries(schemas))
    for (const ref of refs(value))
      edge(
        'SCHEMA_REFERENCES_SCHEMA',
        schemaIds.get(schemaPointer(name))!,
        schemaIds.get(ref)!,
        explicit([schemaPointer(name), ref], [`Local schema reference ${ref}`]),
      );
  const securityIds = new Map<string, string>();
  for (const name of Object.keys(obj(k.securitySchemes)).sort(graphCompare))
    securityIds.set(
      name,
      node(
        'SECURITY_SCHEME',
        name,
        name,
        explicit(
          [`#/components/securitySchemes/${ptr(name)}`],
          [`Security scheme ${name}`],
        ),
      ),
    );
  const opIds = new Map<string, string>();
  const successRefs = new Map<string, string[]>();
  for (const op of [...k.operations].sort((a, b) =>
    graphCompare(a.key, b.key),
  )) {
    const opId = node(
      'OPERATION',
      op.key,
      op.key,
      explicit([op.sourcePointer], [`Operation ${op.key}`]),
    );
    opIds.set(op.key, opId);
    for (const server of Array.isArray(op.servers) ? op.servers : []) {
      const url = obj(server)['url'];
      if (typeof url === 'string') {
        const p = explicit(
          [op.sourcePointer],
          [`Effective normalized server ${url}`],
        );
        edge('OPERATION_HAS_SERVER', opId, node('SERVER', url, url, p), p);
      }
    }
    edge(
      'API_HAS_OPERATION',
      api,
      opId,
      explicit([op.sourcePointer], [`Operation ${op.key}`]),
    );
    for (const tag of sorted(op.tags))
      edge(
        'OPERATION_TAGGED_WITH',
        opId,
        node(
          'TAG',
          tag,
          tag,
          explicit([`${op.sourcePointer}/tags`], [`Tag ${tag}`]),
        ),
        explicit([`${op.sourcePointer}/tags`], [`Tag ${tag}`]),
      );
    for (const param of op.parameters) {
      const pn = node(
        'PARAMETER',
        graphLogicalId(op.key, param.location, param.name),
        `${param.location}: ${param.name}`,
        explicit(
          [param.sourcePointer],
          [`Parameter ${param.location}:${param.name}`],
        ),
      );
      edge(
        'OPERATION_HAS_PARAMETER',
        opId,
        pn,
        explicit([param.sourcePointer], [`Parameter of ${op.key}`]),
      );
      schemaUse(
        pn,
        'PARAMETER_USES_SCHEMA',
        param.schema,
        param.sourcePointer,
        graphLogicalId(op.key, param.location, param.name),
      );
      contentUse(
        pn,
        'PARAMETER_USES_SCHEMA',
        param.content,
        param.sourcePointer,
        graphLogicalId(op.key, param.location, param.name),
      );
      for (const r of refs([param.schema, param.content]))
        edge(
          'PARAMETER_USES_SCHEMA',
          pn,
          schemaIds.get(r)!,
          explicit([param.sourcePointer, r], [`Local schema reference ${r}`]),
        );
    }
    if (op.requestBody) {
      const body = op.requestBody;
      const bn = node(
        'REQUEST_BODY',
        op.key,
        `${op.key} request`,
        explicit([body.sourcePointer], ['Declared request body']),
      );
      edge(
        'OPERATION_ACCEPTS_REQUEST',
        opId,
        bn,
        explicit([body.sourcePointer], ['Declared request body']),
      );
      contentUse(
        bn,
        'REQUEST_USES_SCHEMA',
        body.content,
        body.sourcePointer,
        graphLogicalId(op.key, 'request'),
      );
      for (const r of refs(body.content))
        edge(
          'REQUEST_USES_SCHEMA',
          bn,
          schemaIds.get(r)!,
          explicit([body.sourcePointer, r], [`Local schema reference ${r}`]),
        );
    }
    const successes: string[] = [];
    for (const response of op.responses) {
      const rn = node(
        'RESPONSE',
        `${op.key}:${response.status}`,
        `${response.status}: ${response.description || 'Response'}`,
        explicit([response.sourcePointer], [`Response ${response.status}`]),
      );
      edge(
        'OPERATION_RETURNS_RESPONSE',
        opId,
        rn,
        explicit([response.sourcePointer], [`Response ${response.status}`]),
      );
      contentUse(
        rn,
        'RESPONSE_USES_SCHEMA',
        response.content,
        response.sourcePointer,
        graphLogicalId(op.key, 'response', response.status),
      );
      for (const r of refs(response.content))
        edge(
          'RESPONSE_USES_SCHEMA',
          rn,
          schemaIds.get(r)!,
          explicit(
            [response.sourcePointer, r],
            [`Local schema reference ${r}`],
          ),
        );
      if (/^2(?:\d\d|XX)$/.test(response.status))
        successes.push(...contentDirect(response.content));
    }
    successRefs.set(op.key, sorted(successes));
    for (const [group, req] of (Array.isArray(op.security)
      ? op.security
      : []
    ).entries())
      for (const [name, scopes] of Object.entries(obj(req))) {
        const sid = securityIds.get(name);
        if (!sid)
          throw new ValidationError(
            'Graph references an undeclared security scheme.',
          );
        const p = provenance(
          'SECURITY_REQUIREMENT',
          [op.sourcePointer, `#/components/securitySchemes/${ptr(name)}`],
          [
            `Effective security alternative ${group + 1}: ${canonicalJson(req)}; empty alternatives permit anonymous access.`,
          ],
        );
        edge('OPERATION_REQUIRES_SECURITY', opId, sid, p);
        const scheme = obj(obj(k.securitySchemes)[name]);
        if (scheme['type'] === 'oauth2' && Array.isArray(scopes))
          for (const scope of scopes) {
            if (typeof scope !== 'string') continue;
            const declared = Object.values(obj(scheme['flows'])).some((flow) =>
              Object.hasOwn(obj(obj(flow)['scopes']), scope),
            );
            if (declared) {
              const ap = provenance(
                'DECLARED_SCOPE',
                [`#/components/securitySchemes/${ptr(name)}/flows`],
                [`Declared OAuth2 scope ${scope}`],
              );
              edge(
                'SECURITY_HAS_ACTOR',
                sid,
                node('ACTOR', `${name}:${scope}`, `Capability: ${scope}`, ap),
                ap,
              );
            }
          }
      }
  }
  for (const [i, server] of (Array.isArray(k.servers)
    ? k.servers
    : []
  ).entries()) {
    const url = obj(server)['url'];
    if (typeof url === 'string') {
      const p = explicit([`#/servers/${i}`], [`Declared server ${url}`]);
      edge('API_HAS_SERVER', api, node('SERVER', url, url, p), p);
    }
  }
  const groups = new Map<
    string,
    { base: string; schema: string; keys: string[] }
  >();
  const operations = new Map(k.operations.map((o) => [o.key, o]));
  for (const op of k.operations) {
    const parts = op.path.split('/').filter(Boolean);
    if (!parts.length) continue;
    if (/^\{[^{}]+\}$/.test(parts.at(-1)!)) parts.pop();
    const terminal = parts.at(-1);
    if (
      !terminal ||
      terminal.includes('{') ||
      actionSegments.has(terminal.toLowerCase())
    )
      continue;
    const base = '/' + parts.join('/');
    for (const ref of successRefs.get(op.key) ?? []) {
      const name = nodes.get(schemaIds.get(ref)!)!.label;
      if (
        ![name.toLowerCase(), `${name.toLowerCase()}s`].includes(
          terminal.toLowerCase(),
        )
      )
        continue;
      const key = graphLogicalId(base, ref);
      const g = groups.get(key) ?? { base, schema: ref, keys: [] };
      g.keys.push(op.key);
      groups.set(key, g);
    }
  }
  for (const [key, g] of [...groups].sort(([a], [b]) => graphCompare(a, b))) {
    const keys = sorted(g.keys);
    if (keys.length < 2) continue;
    const schemaId = schemaIds.get(g.schema)!;
    const name = nodes.get(schemaId)!.label;
    const relevant = keys.map((key) => operations.get(key)!);
    const p = provenance(
      'RESOURCE_PATH_SCHEMA',
      [g.schema, ...relevant.map((o) => o.sourcePointer)],
      [
        `Canonical collection ${g.base}`,
        `Shared direct successful response schema ${name}`,
      ],
    );
    const resource = node('RESOURCE', key, `${name} (${g.base})`, p);
    edge('RESOURCE_USES_SCHEMA', resource, schemaId, p);
    const schema = obj(schemas[name]);
    const properties = obj(schema['properties']);
    const required = Array.isArray(schema['required'])
      ? schema['required']
      : [];
    const primitives = new Map<
      string,
      { id: string; type: string; format: string; pointer: string }
    >();
    for (const [property, definition] of Object.entries(properties)) {
      const d = obj(definition);
      if (
        !['id', `${name.toLowerCase()}id`].includes(property.toLowerCase()) ||
        !required.includes(property) ||
        !['string', 'integer'].includes(String(d['type']))
      )
        continue;
      const pp = `${g.schema}/properties/${ptr(property)}`;
      const ip = provenance(
        'IDENTIFIER_EXACT',
        [pp],
        [`Required ${d['type']} identifier ${name}.${property}`],
      );
      const identifier = node(
        'IDENTIFIER',
        `${key}:${property}`,
        `${name}.${property}`,
        ip,
      );
      edge('IDENTIFIER_BELONGS_TO_RESOURCE', identifier, resource, ip);
      primitives.set(property, {
        id: identifier,
        type: String(d['type']),
        format: typeof d['format'] === 'string' ? d['format'] : '',
        pointer: pp,
      });
    }
    for (const field of ['status', 'state']) {
      const d = obj(properties[field]);
      const values = d['enum'];
      if (
        d['type'] !== 'string' ||
        !Array.isArray(values) ||
        values.length < 2 ||
        values.length > 30 ||
        values.some((v) => typeof v !== 'string' || !v.length) ||
        new Set(values).size !== values.length
      )
        continue;
      for (const value of [...values].sort((a, b) =>
        graphCompare(String(a), String(b)),
      )) {
        const sp = `${g.schema}/properties/${field}/enum`;
        const p = provenance(
          'STATUS_ENUM',
          [sp],
          [`Possible ${field} value ${value}; no transition inferred`],
        );
        edge(
          'STATE_BELONGS_TO_RESOURCE',
          node(
            'STATE',
            `${key}:${field}:${JSON.stringify(value)}`,
            `${name}.${field}: ${value}`,
            p,
          ),
          resource,
          p,
        );
      }
    }
    const producers = new Map<string, string[]>();
    const consumers = new Map<string, string[]>();
    for (const op of k.operations) {
      const collection = op.path === g.base;
      const itemMatch = op.path.startsWith(g.base + '/')
        ? op.path.slice(g.base.length + 1).match(/^\{([^{}]+)\}$/)
        : null;
      if (!collection && !itemMatch) continue;
      const hasResponse = (successRefs.get(op.key) ?? []).includes(g.schema);
      const pathParam = itemMatch
        ? op.parameters.find(
            (param) =>
              param.location === 'path' &&
              param.required &&
              param.name === itemMatch[1],
          )
        : undefined;
      const compatible = pathParam
        ? [...primitives.entries()].filter(
            ([, ident]) =>
              ['id', `${name.toLowerCase()}id`].includes(
                pathParam.name.toLowerCase(),
              ) &&
              obj(pathParam.schema)['type'] === ident.type &&
              (obj(pathParam.schema)['format'] ?? '') === ident.format,
          )
        : [];
      const match = compatible.length === 1 ? compatible[0] : undefined;
      let relation: GraphEdgeType | undefined;
      if (op.method === 'GET' && hasResponse && (collection || match))
        relation = 'OPERATION_READS_RESOURCE';
      if (op.method === 'POST' && collection && hasResponse)
        relation = 'OPERATION_CREATES_RESOURCE';
      if (
        ['PATCH', 'PUT'].includes(op.method) &&
        match &&
        hasResponse &&
        op.requestBody
      )
        relation = 'OPERATION_UPDATES_RESOURCE';
      if (
        op.method === 'DELETE' &&
        match &&
        op.responses.some(
          (r) =>
            /^2\d\d$/.test(r.status) &&
            Object.keys(obj(r.content)).length === 0,
        )
      )
        relation = 'OPERATION_DELETES_RESOURCE';
      if (!relation) continue;
      const opId = opIds.get(op.key)!;
      edge(
        relation,
        opId,
        resource,
        provenance(
          'CRUD_CORROBORATED',
          [
            g.schema,
            op.sourcePointer,
            ...(pathParam ? [pathParam.sourcePointer] : []),
          ],
          [
            `${op.key} matches ${g.base}; corroborated schema/identifier and successful response structure. Specification intent only.`,
          ],
        ),
      );
      if (relation === 'OPERATION_CREATES_RESOURCE')
        for (const ident of primitives.values()) {
          const directObject = op.responses.some(
            (r) =>
              /^2\d\d$/.test(r.status) &&
              Object.values(obj(r.content)).some(
                (m) => obj(obj(m)['schema'])['$ref'] === g.schema,
              ),
          );
          if (!directObject) continue;
          edge(
            'OPERATION_PRODUCES_IDENTIFIER',
            opId,
            ident.id,
            provenance(
              'IDENTIFIER_EXACT',
              [ident.pointer, op.sourcePointer],
              [`${op.key} returns required identifier ${name}`],
            ),
          );
          producers.set(ident.id, [...(producers.get(ident.id) ?? []), opId]);
        }
      if (match && pathParam) {
        const ident = match[1];
        edge(
          'OPERATION_CONSUMES_IDENTIFIER',
          opId,
          ident.id,
          provenance(
            'IDENTIFIER_EXACT',
            [ident.pointer, pathParam.sourcePointer],
            [
              `Exact resource-id name and ${ident.type}/${ident.format || 'no format'} compatibility`,
            ],
          ),
        );
        consumers.set(ident.id, [...(consumers.get(ident.id) ?? []), opId]);
      }
    }
    for (const [ident, createOps] of producers)
      for (const before of createOps)
        for (const after of consumers.get(ident) ?? [])
          if (before !== after)
            edge(
              'OPERATION_PRECEDES_OPERATION',
              before,
              after,
              provenance(
                'IDENTIFIER_DEPENDENCY',
                [
                  ...nodes.get(ident)!.provenance.sourcePointers,
                  ...nodes.get(before)!.provenance.sourcePointers,
                  ...nodes.get(after)!.provenance.sourcePointers,
                ],
                [
                  `Compatible produced/consumed identifier ${nodes.get(ident)!.label}`,
                  `Resource ${name} at ${g.base}; structural dependency, not runtime evidence`,
                ],
              ),
            );
  }
  const graph: BehaviourGraph = {
    modelVersion: 1,
    builderVersion: GRAPH_BUILDER_VERSION,
    workspaceId: source.workspaceId,
    projectId: source.projectId,
    importId: source.id,
    nodes: [...nodes.values()].sort((a, b) => graphCompare(a.id, b.id)),
    edges: [...edges.values()].sort((a, b) => graphCompare(a.id, b.id)),
  };
  validateGraph(graph);
  return graph;
}
export function validateGraph(graph: unknown): asserts graph is BehaviourGraph {
  assertBehaviourGraph(graph);
  for (const fact of [...graph.nodes, ...graph.edges])
    if (!Object.hasOwn(graphRules, fact.provenance.ruleId))
      throw new ValidationError('Unknown graph inference rule.');
}
export function outgoing(g: BehaviourGraph, id: string) {
  return g.edges.filter((e) => e.from === id);
}
export function createGraphIndex(g: BehaviourGraph) {
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  const inEdges = new Map<string, GraphEdge[]>();
  const outEdges = new Map<string, GraphEdge[]>();
  for (const e of g.edges) {
    const incoming = inEdges.get(e.to) ?? [];
    incoming.push(e);
    inEdges.set(e.to, incoming);
    const outgoing = outEdges.get(e.from) ?? [];
    outgoing.push(e);
    outEdges.set(e.from, outgoing);
  }
  return {
    nodes,
    incoming: (id: string) => inEdges.get(id) ?? [],
    outgoing: (id: string) => outEdges.get(id) ?? [],
  };
}
export function incoming(g: BehaviourGraph, id: string) {
  return g.edges.filter((e) => e.to === id);
}
export function neighbors(g: BehaviourGraph, id: string) {
  const ids = new Set([
    ...incoming(g, id).map((e) => e.from),
    ...outgoing(g, id).map((e) => e.to),
  ]);
  return g.nodes.filter((n) => ids.has(n.id));
}
export function operationsTouchingResource(g: BehaviourGraph, id: string) {
  const ids = new Set(
    incoming(g, id)
      .filter((e) => e.type.startsWith('OPERATION_'))
      .map((e) => e.from),
  );
  return g.nodes.filter((n) => ids.has(n.id));
}
export function schemasUsedByOperation(g: BehaviourGraph, id: string) {
  const bodies = new Set(
    outgoing(g, id)
      .filter((e) =>
        [
          'OPERATION_HAS_PARAMETER',
          'OPERATION_ACCEPTS_REQUEST',
          'OPERATION_RETURNS_RESPONSE',
        ].includes(e.type),
      )
      .map((e) => e.to),
  );
  const schemas = new Set(
    g.edges
      .filter((e) => bodies.has(e.from) && e.type.endsWith('USES_SCHEMA'))
      .map((e) => e.to),
  );
  return g.nodes.filter((n) => schemas.has(n.id));
}
export function securityRequiredByOperation(g: BehaviourGraph, id: string) {
  const ids = new Set(
    outgoing(g, id)
      .filter((e) => e.type === 'OPERATION_REQUIRES_SECURITY')
      .map((e) => e.to),
  );
  return g.nodes.filter((n) => ids.has(n.id));
}
export function identifierProducers(g: BehaviourGraph, id: string) {
  return incoming(g, id).filter(
    (e) => e.type === 'OPERATION_PRODUCES_IDENTIFIER',
  );
}
export function identifierConsumers(g: BehaviourGraph, id: string) {
  return incoming(g, id).filter(
    (e) => e.type === 'OPERATION_CONSUMES_IDENTIFIER',
  );
}
export function dependentOperations(g: BehaviourGraph, id: string) {
  const ids = new Set(
    outgoing(g, id)
      .filter((e) => e.type === 'OPERATION_PRECEDES_OPERATION')
      .map((e) => e.to),
  );
  return g.nodes.filter((n) => ids.has(n.id));
}
export function bySourcePointer(g: BehaviourGraph, pointer: string) {
  return {
    nodes: g.nodes.filter((n) => n.provenance.sourcePointers.includes(pointer)),
    edges: g.edges.filter((e) => e.provenance.sourcePointers.includes(pointer)),
  };
}
export function byRule(g: BehaviourGraph, ruleId: string) {
  return {
    nodes: g.nodes.filter((n) => n.provenance.ruleId === ruleId),
    edges: g.edges.filter((e) => e.provenance.ruleId === ruleId),
  };
}
