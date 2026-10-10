import { readFileSync } from 'node:fs';
import { parseApiSpec } from '@testpilot/api-spec';
import { buildBehaviourGraph } from '@testpilot/behaviour-graph';
import { deriveQa } from '@testpilot/qa-intelligence';
import type { QaAnalysis } from '@testpilot/domain';
export const time = '2026-10-09T11:14:00Z';
export const source = {
  id: '15000000-0000-0000-0000-000000000001',
  workspaceId: '15000000-0000-0000-0000-000000000002',
  projectId: '15000000-0000-0000-0000-000000000003',
  createdAt: time,
  createdBy: '15000000-0000-0000-0000-000000000004',
  knowledge: parseApiSpec(
    readFileSync('packages/qa-intelligence/tests/fixtures/qa.json', 'utf8'),
    'json',
  ).knowledge,
};
export const snapshot = {
  id: '15000000-0000-0000-0000-000000000005',
  createdAt: time,
  createdBy: source.createdBy,
  graph: buildBehaviourGraph(source),
};
const input = deriveQa({ source, snapshot });
export const analysis: QaAnalysis = {
  ...input,
  id: '15000000-0000-0000-0000-000000000006',
  createdAt: time,
  createdBy: source.createdBy,
  records: input.items.map((item, index) => ({
    ...item,
    id: `15000000-0000-0000-0000-${String(index + 100).padStart(12, '0')}`,
    analysisId: '15000000-0000-0000-0000-000000000006',
    createdAt: time,
    createdBy: source.createdBy,
    reviews: [],
  })),
};
export const requirement = analysis.records.find(
  (i) => i.kind === 'REQUIREMENT',
)!;
