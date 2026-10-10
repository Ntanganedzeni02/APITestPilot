import {
  reviewState,
  type QaItem,
  type QaAnalysis,
  type GraphSnapshot,
} from '@testpilot/domain';
export const requirementSources = {
  SPEC_EXPLICIT: 'Specification',
  GRAPH_DERIVED: 'Graph inference',
  AI_PROPOSED: 'AI suggestion',
  HUMAN_AUTHORED: 'Human authored',
} as const;
export const requirementStatuses = {
  PROPOSED: 'Awaiting review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
} as const;
export function requirementEntities(
  item: QaItem,
  graph: GraphSnapshot | null,
  names?: Map<string, string>,
) {
  const nodes =
    names ?? new Map(graph?.graph.nodes.map((n) => [n.id, n.label]) ?? []);
  return [
    ...new Set(
      item.nodeRefs
        .map((id) => nodes.get(id))
        .filter((name): name is string => !!name),
    ),
  ];
}
export function requirementCounts(
  analysis: QaAnalysis,
  kind: QaItem['kind'] = 'REQUIREMENT',
) {
  const items = analysis.records.filter((i) => i.kind === kind);
  return {
    total: items.length,
    awaiting: items.filter((i) => reviewState(i).status === 'PROPOSED').length,
    approved: items.filter((i) => reviewState(i).status === 'APPROVED').length,
    rejected: items.filter((i) => reviewState(i).status === 'REJECTED').length,
  };
}
export function filterRequirements(
  analysis: QaAnalysis,
  graph: GraphSnapshot | null,
  filters: {
    search: string;
    status: string;
    category: string;
    source: string;
    entity: string;
    severity?: string;
  },
  kind: QaItem['kind'] = 'REQUIREMENT',
) {
  const search = filters.search.trim().toLowerCase();
  const names = new Map(graph?.graph.nodes.map((n) => [n.id, n.label]) ?? []);
  return analysis.records
    .filter((i) => i.kind === kind)
    .filter((i) => {
      const current = reviewState(i);
      return (
        (filters.status === 'ALL' || current.status === filters.status) &&
        (filters.category === 'ALL' || i.category === filters.category) &&
        (filters.source === 'ALL' || i.sourceKind === filters.source) &&
        (filters.entity === 'ALL' || i.nodeRefs.includes(filters.entity)) &&
        (!filters.severity ||
          filters.severity === 'ALL' ||
          i.severity === filters.severity) &&
        [
          current.title,
          current.statement,
          i.category,
          requirementSources[i.sourceKind],
          ...requirementEntities(i, graph, names),
        ]
          .join(' ')
          .toLowerCase()
          .includes(search)
      );
    });
}
