import {
  ValidationError,
  validateId,
  type ApiImportSummary,
  type GraphSnapshot,
} from './index.js';
export const requirementCategories = [
  'FUNCTIONAL',
  'VALIDATION',
  'SECURITY',
  'AUTHORIZATION',
  'DATA_CONTRACT',
  'ERROR_HANDLING',
  'STATE',
  'DEPENDENCY',
  'IDEMPOTENCY',
  'PAGINATION',
  'FILTERING',
  'SORTING',
  'RATE_LIMITING',
  'CONCURRENCY',
  'PERFORMANCE',
  'OBSERVABILITY',
] as const;
export const riskCategories = [
  'AUTHENTICATION',
  'AUTHORIZATION',
  'INPUT_VALIDATION',
  'DATA_INTEGRITY',
  'STATE_MANAGEMENT',
  'DEPENDENCY',
  'DESTRUCTIVE_OPERATION',
  'SENSITIVE_DATA',
  'ERROR_HANDLING',
  'CONCURRENCY',
  'IDEMPOTENCY',
  'RATE_LIMITING',
  'PERFORMANCE',
  'CONTRACT_COMPLEXITY',
  'INTEGRATION',
] as const;
export const qaSources = {
  SPEC_EXPLICIT: 'EXPLICIT',
  GRAPH_DERIVED: 'DETERMINISTIC_INFERENCE',
  AI_PROPOSED: 'AI_INFERENCE',
  HUMAN_AUTHORED: 'HUMAN',
} as const;
export type QaKind = 'REQUIREMENT' | 'RISK';
export type QaSource = keyof typeof qaSources;
export type QaStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED';
export type QaSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export interface QaContext {
  source: ApiImportSummary;
  snapshot: GraphSnapshot;
}
export interface QaProposal {
  logicalKey: string;
  kind: QaKind;
  title: string;
  statement: string;
  category: string;
  sourceKind: QaSource;
  derivationType: (typeof qaSources)[QaSource];
  confidence: 'EXACT' | 'STRONG' | 'SUPPORTED';
  ruleId: string;
  reason: string;
  sourcePointers: string[];
  nodeRefs: string[];
  edgeRefs: string[];
  requirementRefs: string[];
  severity: QaSeverity | null;
  priority: 'ROUTINE' | 'HIGH' | 'URGENT' | null;
}
export interface QaAnalysisInput {
  workspaceId: string;
  projectId: string;
  importId: string;
  graphId: string;
  engineVersion: string;
  aiStatus: 'NOT_CONFIGURED' | 'SUCCEEDED' | 'FAILED';
  aiMetadata: {
    provider: string;
    model: string;
    promptVersion: string;
    analysisVersion: string;
    validated: true;
    completedAt: string;
    inputEvidence: string[];
  } | null;
  aiFailure: string | null;
  items: QaProposal[];
}
export interface QaReview {
  id: string;
  itemId: string;
  actorId: string;
  createdAt: string;
  decision: 'APPROVE' | 'REJECT' | 'EDIT';
  rationale: string;
  title: string | null;
  statement: string | null;
}
export interface QaItem extends QaProposal {
  id: string;
  analysisId: string;
  createdAt: string;
  createdBy: string;
  reviews: QaReview[];
}
export interface QaAnalysis extends QaAnalysisInput {
  id: string;
  createdAt: string;
  createdBy: string;
  records: QaItem[];
}
export interface QaRepository {
  save(input: QaAnalysisInput): Promise<string>;
  list(workspaceId: string, projectId: string): Promise<QaAnalysis[]>;
  review(
    itemId: string,
    expectedReviewId: string | null,
    decision: QaReview['decision'],
    rationale: string,
    title: string | null,
    statement: string | null,
  ): Promise<string>;
  add(analysisId: string, input: QaProposal): Promise<string>;
}
export const QA_LIMITS = {
  items: 1000,
  aiItems: 50,
  refs: 30,
  text: 4000,
  reason: 2000,
  title: 160,
  bytes: 4 * 1024 * 1024,
} as const;
export function assertQaContext(context: QaContext) {
  const { source: s, snapshot: g } = context;
  for (const id of [s.id, s.workspaceId, s.projectId, g.id]) validateId(id);
  if (
    g.graph.workspaceId !== s.workspaceId ||
    g.graph.projectId !== s.projectId ||
    g.graph.importId !== s.id
  )
    throw new ValidationError('Intelligence source snapshot mismatch.');
}
export function assertQaProposal(value: unknown): asserts value is QaProposal {
  const bad = () => {
    throw new ValidationError('Invalid QA proposal.');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad();
  const p = value as Record<string, unknown>;
  if (
    !['REQUIREMENT', 'RISK'].includes(String(p['kind'])) ||
    !Object.hasOwn(qaSources, String(p['sourceKind'])) ||
    qaSources[p['sourceKind'] as QaSource] !== p['derivationType']
  )
    return bad();
  for (const [key, max] of [
    ['logicalKey', 1000],
    ['title', 160],
    ['statement', 4000],
    ['reason', 2000],
    ['ruleId', 80],
  ] as const)
    if (typeof p[key] !== 'string' || !p[key].trim() || p[key].length > max)
      return bad();
  if (
    !/^[A-Z][A-Z0-9_]*$/.test(String(p['ruleId'])) ||
    !['EXACT', 'STRONG', 'SUPPORTED'].includes(String(p['confidence'])) ||
    (p['sourceKind'] === 'AI_PROPOSED' && p['confidence'] === 'EXACT')
  )
    return bad();
  if (
    !(
      p['kind'] === 'REQUIREMENT' ? requirementCategories : riskCategories
    ).includes(p['category'] as never)
  )
    return bad();
  if (
    p['kind'] === 'REQUIREMENT'
      ? p['severity'] !== null || p['priority'] !== null
      : !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(
          String(p['severity']),
        ) || !['ROUTINE', 'HIGH', 'URGENT'].includes(String(p['priority']))
  )
    return bad();
  for (const key of [
    'sourcePointers',
    'nodeRefs',
    'edgeRefs',
    'requirementRefs',
  ]) {
    const refs = p[key];
    if (
      !Array.isArray(refs) ||
      refs.length > 30 ||
      new Set(refs).size !== refs.length ||
      refs.some((r) => typeof r !== 'string' || !r.length || r.length > 2000)
    )
      return bad();
  }
  if (
    !(p['sourcePointers'] as string[]).length ||
    !(p['nodeRefs'] as string[]).length
  )
    return bad();
  if (
    (p['sourcePointers'] as string[]).some(
      (s) => s !== '#' && !s.startsWith('#/'),
    )
  )
    return bad();
}
export function assertQaAnalysis(value: QaAnalysisInput) {
  for (const id of [
    value.workspaceId,
    value.projectId,
    value.importId,
    value.graphId,
  ])
    validateId(id);
  if (
    !/^\d+\.\d+\.\d+$/.test(value.engineVersion) ||
    !['NOT_CONFIGURED', 'SUCCEEDED', 'FAILED'].includes(value.aiStatus) ||
    value.items.length > QA_LIMITS.items ||
    value.items.some((i) => i.sourceKind === 'HUMAN_AUTHORED') ||
    value.items.filter((i) => i.sourceKind === 'AI_PROPOSED').length >
      QA_LIMITS.aiItems
  )
    throw new ValidationError('Invalid QA analysis.');
  const keys = new Set<string>();
  for (const item of value.items) {
    assertQaProposal(item);
    if (keys.has(item.logicalKey))
      throw new ValidationError('Duplicate QA logical identity.');
    keys.add(item.logicalKey);
  }
  for (const item of value.items)
    for (const ref of item.requirementRefs)
      if (
        !value.items.some(
          (i) => i.logicalKey === ref && i.kind === 'REQUIREMENT',
        )
      )
        throw new ValidationError('Invalid requirement traceability.');
  if (
    value.aiStatus !== 'SUCCEEDED' &&
    (value.aiMetadata !== null ||
      value.items.some((i) => i.sourceKind === 'AI_PROPOSED'))
  )
    throw new ValidationError('Invalid AI analysis state.');
  if (
    value.aiStatus === 'SUCCEEDED' &&
    (!value.aiMetadata || value.aiMetadata.validated !== true)
  )
    throw new ValidationError('Missing validated AI provenance.');
  const metadata = value.aiMetadata;
  if (metadata) {
    for (const field of [
      metadata.provider,
      metadata.model,
      metadata.promptVersion,
      metadata.analysisVersion,
    ])
      if (typeof field !== 'string' || !field.trim() || field.length > 200)
        throw new ValidationError('Invalid AI provenance.');
    if (
      !Number.isFinite(Date.parse(metadata.completedAt)) ||
      !Array.isArray(metadata.inputEvidence) ||
      metadata.inputEvidence.length > 500 ||
      metadata.inputEvidence.some(
        (ref) => typeof ref !== 'string' || !/^[ne][0-9]+$/.test(ref),
      )
    )
      throw new ValidationError('Invalid AI evidence catalog.');
  }
  if (
    (value.aiStatus === 'FAILED' &&
      (typeof value.aiFailure !== 'string' ||
        !value.aiFailure.length ||
        value.aiFailure.length > 500)) ||
    (value.aiStatus !== 'FAILED' && value.aiFailure !== null)
  )
    throw new ValidationError('Invalid AI failure state.');
  if (new TextSize(JSON.stringify(value)).bytes > QA_LIMITS.bytes)
    throw new ValidationError('QA analysis exceeds 4 MiB.');
}
class TextSize {
  readonly bytes: number;
  constructor(text: string) {
    this.bytes = Array.from(text).reduce((n, c) => {
      const p = c.codePointAt(0)!;
      return n + (p < 128 ? 1 : p < 2048 ? 2 : p < 65536 ? 3 : 4);
    }, 0);
  }
}
export function reviewState(item: QaItem): {
  status: QaStatus;
  title: string;
  statement: string;
  edited: boolean;
} {
  let status: QaStatus = 'PROPOSED',
    title = item.title,
    statement = item.statement,
    edited = false;
  for (const r of item.reviews) {
    if (r.decision === 'EDIT') {
      title = r.title!;
      statement = r.statement!;
      edited = true;
      status = 'PROPOSED';
    } else status = r.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  }
  return { status, title, statement, edited };
}
export function canReview(role: string, decision: QaReview['decision']) {
  return decision === 'EDIT'
    ? ['OWNER', 'ADMIN', 'MEMBER'].includes(role)
    : ['OWNER', 'ADMIN'].includes(role);
}
