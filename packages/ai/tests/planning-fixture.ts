import { readFileSync } from 'node:fs';
import { parseApiSpec } from '../../api-spec/dist/index.js';
import { buildBehaviourGraph } from '../../behaviour-graph/dist/index.js';
import { deriveQa } from '../../qa-intelligence/dist/index.js';
import type { PlanningContext } from '@testpilot/domain';
export const uuid = (n: number) =>
  '16000000-0000-0000-0000-' + String(n).padStart(12, '0');
export function context(document?: string, offset = 0): PlanningContext {
  const id = (n: number) => uuid(n + offset);
  const source = {
    id: id(1),
    workspaceId: id(2),
    projectId: id(3),
    createdAt: '2026-10-07T00:00:00Z',
    createdBy: id(4),
    knowledge: parseApiSpec(
      document ??
        readFileSync('packages/qa-intelligence/tests/fixtures/qa.json', 'utf8'),
      'json',
    ).knowledge,
  };
  const snapshot = {
    id: id(5),
    createdAt: source.createdAt,
    createdBy: source.createdBy,
    graph: buildBehaviourGraph(source),
  };
  const input = deriveQa({ source, snapshot });
  return {
    source,
    snapshot,
    analysis: {
      ...input,
      id: id(6),
      createdAt: source.createdAt,
      createdBy: source.createdBy,
      records: input.items.map((item, n) => ({
        ...item,
        id: id(n + 100),
        analysisId: id(6),
        createdAt: source.createdAt,
        createdBy: source.createdBy,
        reviews:
          item.kind === 'REQUIREMENT'
            ? [
                {
                  id: id(n + 1000),
                  itemId: id(n + 100),
                  actorId: id(4),
                  createdAt: source.createdAt,
                  revision: 1,
                  decision: 'APPROVE' as const,
                  rationale: 'Local fixture approval.',
                  title: null,
                  statement: null,
                },
              ]
            : [],
      })),
    },
  };
}
