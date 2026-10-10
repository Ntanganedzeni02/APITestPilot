import type {
  ApiOperation,
  ApiImportSummary,
  BehaviourGraph,
  GraphNode,
  Json,
} from '@testpilot/domain';

export function object(value: Json | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}
export function schemaType(value: Json | undefined): string {
  if (value === true) return 'Any value (unrestricted schema)';
  if (value === false) return 'No value allowed';
  const s = object(value);
  if (typeof s['$ref'] === 'string')
    return `Reference: ${s['$ref'].split('/').pop()}`;
  if (Array.isArray(s['type'])) return s['type'].join(' or ');
  if (s['type'] === 'array') return `array of ${schemaType(s['items'])}`;
  if (typeof s['type'] === 'string') return s['type'];
  for (const key of ['oneOf', 'anyOf', 'allOf'])
    if (Array.isArray(s[key]))
      return `${key === 'oneOf' ? 'Exactly one' : key === 'anyOf' ? 'Any' : 'All'} of ${(s[key] as Json[]).length} schemas`;
  return 'Type not declared';
}
export function constraints(value: Json | undefined): string {
  const s = object(value);
  const names: Record<string, string> = {
    format: 'Format',
    minimum: 'Minimum',
    maximum: 'Maximum',
    exclusiveMinimum: 'Exclusive minimum',
    exclusiveMaximum: 'Exclusive maximum',
    minLength: 'Min length',
    maxLength: 'Max length',
    pattern: 'Pattern',
    minItems: 'Min items',
    maxItems: 'Max items',
    uniqueItems: 'Unique items',
    minProperties: 'Min properties',
    maxProperties: 'Max properties',
    nullable: 'Nullable',
    readOnly: 'Read only',
    writeOnly: 'Write only',
    additionalProperties: 'Additional properties',
    enum: 'Allowed values',
    const: 'Constant',
  };
  return (
    Object.entries(names)
      .filter(([key]) => s[key] !== undefined)
      .map(
        ([key, label]) =>
          `${label}: ${typeof s[key] === 'object' && !Array.isArray(s[key]) ? 'Schema-defined' : JSON.stringify(s[key])}`,
      )
      .join('; ') || 'None declared'
  );
}
export function filterEndpoints(
  operations: ApiOperation[],
  search: string,
  method: string,
) {
  const query = search.trim().toLowerCase();
  return operations.filter(
    (op) =>
      (method === 'ALL' || op.method === method) &&
      [op.method, op.path, op.summary ?? '', ...op.tags]
        .join(' ')
        .toLowerCase()
        .includes(query),
  );
}
export function endpointGroups(
  operations: ApiOperation[],
  grouping: string,
  graph?: BehaviourGraph,
) {
  const nodes = new Map(graph?.nodes.map((n) => [n.id, n]) ?? []);
  const operationsByPointer = new Map<string, GraphNode>();
  const resourcesByOperation = new Map<string, string[]>();
  if (grouping === 'resource' && graph) {
    for (const node of graph.nodes)
      if (node.type === 'OPERATION')
        for (const pointer of node.provenance.sourcePointers)
          operationsByPointer.set(pointer, node);
    for (const edge of graph.edges)
      if (
        [
          'OPERATION_READS_RESOURCE',
          'OPERATION_CREATES_RESOURCE',
          'OPERATION_UPDATES_RESOURCE',
          'OPERATION_DELETES_RESOURCE',
        ].includes(edge.type)
      ) {
        const label = nodes.get(edge.to)?.label;
        if (label)
          resourcesByOperation.set(edge.from, [
            ...(resourcesByOperation.get(edge.from) ?? []),
            label,
          ]);
      }
  }
  const groups = new Map<string, ApiOperation[]>();
  for (const op of operations) {
    const node = operationsByPointer.get(op.sourcePointer);
    const resources = node ? (resourcesByOperation.get(node.id) ?? []) : [];
    const labels =
      grouping === 'resource'
        ? [...new Set(resources)].length
          ? [...new Set(resources)]
          : ['No inferred resource']
        : grouping === 'tag'
          ? op.tags.length
            ? op.tags
            : ['Untagged']
          : ['All endpoints'];
    for (const label of labels)
      groups.set(label, [...(groups.get(label) ?? []), op]);
  }
  return [...groups];
}
export function securityLabel(value: Json) {
  if (!Array.isArray(value)) return 'Security unavailable';
  if (!value.length) return 'No security requirement';
  if (value.some((v) => Object.keys(object(v)).length === 0))
    return 'Authentication optional';
  return 'Authentication declared';
}
export function relatedFacts(
  graph: BehaviourGraph | undefined,
  op: ApiOperation,
): { node: GraphNode | undefined; edges: BehaviourGraph['edges'] } {
  const node = graph?.nodes.find(
    (n) =>
      n.type === 'OPERATION' &&
      n.provenance.sourcePointers.includes(op.sourcePointer),
  );
  return {
    node,
    edges: node
      ? graph!.edges.filter((e) => e.from === node.id || e.to === node.id)
      : [],
  };
}

export type ImportOption = Omit<ApiImportSummary, 'knowledge'> & {
  title: string;
  version: string;
  operationCount: number;
};
export function importOption({
  knowledge,
  ...metadata
}: ApiImportSummary): ImportOption {
  return {
    ...metadata,
    title: knowledge.title,
    version: knowledge.version,
    operationCount: knowledge.operations.length,
  };
}
