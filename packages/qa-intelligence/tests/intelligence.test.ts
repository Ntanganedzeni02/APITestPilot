import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseApiSpec } from '@testpilot/api-spec';
import { buildBehaviourGraph } from '@testpilot/behaviour-graph';
import {
  assertQaAnalysis,
  reviewState,
  canReview,
  type QaContext,
  type QaItem,
} from '@testpilot/domain';
import {
  deriveQa,
  analyzeQa,
  itemsForNode,
  risksForRequirement,
  itemsBySourcePointer,
  itemsByStatus,
  requirementsForOperation,
  requirementsForResource,
  requirementsForSchema,
  risksForOperation,
  risksForResource,
} from '../src/index.js';
import { createAiEvidence, type QaIntelligenceProvider } from '@testpilot/ai';
export function context(): QaContext {
  const source = {
    id: '15000000-0000-0000-0000-000000000001',
    workspaceId: '15000000-0000-0000-0000-000000000002',
    projectId: '15000000-0000-0000-0000-000000000003',
    createdAt: '2026-10-06T00:00:00Z',
    createdBy: '15000000-0000-0000-0000-000000000004',
    knowledge: parseApiSpec(
      readFileSync('packages/qa-intelligence/tests/fixtures/qa.json', 'utf8'),
      'json',
    ).knowledge,
  };
  return {
    source,
    snapshot: {
      id: '15000000-0000-0000-0000-000000000005',
      createdAt: source.createdAt,
      createdBy: source.createdBy,
      graph: buildBehaviourGraph(source),
    },
  };
}
const valid = (c: QaContext) => ({
  kind: 'REQUIREMENT',
  title: 'Review business intent',
  statement: 'Human review should clarify the intended invariant.',
  category: 'FUNCTIONAL',
  reason: 'Additional question based on cited structure.',
  confidence: 'SUPPORTED',
  evidenceRefs: [createAiEvidence(c).request.data.evidence[0]!.id],
  questions: [],
  severity: null,
});
function provider(output: unknown): QaIntelligenceProvider {
  return {
    providerId: 'test-fixture',
    modelId: 'mock-only',
    analyze: async () => output,
  };
}
describe('deterministic QA intelligence', () => {
  it.each([
    'REQ_REQUIRED_PARAMETER',
    'REQ_REQUIRED_BODY',
    'REQ_REQUIRED_PROPERTY',
    'REQ_SCHEMA_TYPE',
    'REQ_SCHEMA_ENUM',
    'REQ_RESPONSE_SCHEMA',
    'REQ_SECURITY',
    'REQ_IDENTIFIER_DEPENDENCY',
  ])('derives %s', (rule) =>
    expect(deriveQa(context()).items.some((i) => i.ruleId === rule)).toBe(true),
  );
  it.each([
    'RISK_DESTRUCTIVE',
    'RISK_SECURITY_SURFACE',
    'RISK_COMPLEX_INPUT',
    'RISK_DEPENDENCY',
    'RISK_STATE_SET',
    'RISK_AUTH_ALTERNATIVES',
    'RISK_ERROR_GAP',
    'RISK_UNSECURED_MUTATION',
  ])('derives %s conservatively', (rule) =>
    expect(deriveQa(context()).items.some((i) => i.ruleId === rule)).toBe(true),
  );
  it('deduplicates stable identities and orders independently of source order', () => {
    const a = context(),
      b = context();
    b.source.knowledge.operations.reverse();
    b.snapshot.graph = buildBehaviourGraph(b.source);
    expect(deriveQa(a)).toEqual(deriveQa(b));
    const items = deriveQa(a).items;
    expect(new Set(items.map((i) => i.logicalKey)).size).toBe(items.length);
  });
  it('resolves pointers, graph refs and requirement traceability to the exact source', () => {
    const c = context(),
      a = deriveQa(c);
    const root = JSON.parse(
      readFileSync('packages/qa-intelligence/tests/fixtures/qa.json', 'utf8'),
    );
    for (const item of a.items) {
      for (const pointer of item.sourcePointers) {
        let v = root;
        for (const p of pointer.slice(2).split('/'))
          v = v[p.replaceAll('~1', '/').replaceAll('~0', '~')];
        expect(v, pointer).toBeDefined();
      }
      for (const ref of item.nodeRefs)
        expect(c.snapshot.graph.nodes.some((n) => n.id === ref)).toBe(true);
      for (const ref of item.edgeRefs)
        expect(c.snapshot.graph.edges.some((e) => e.id === ref)).toBe(true);
      for (const ref of item.requirementRefs)
        expect(
          a.items.some((i) => i.kind === 'REQUIREMENT' && i.logicalKey === ref),
        ).toBe(true);
    }
  });
  it('does not invent roles, rate limits, SLAs, idempotency, transitions or public-GET flaws', () => {
    const a = deriveQa(context());
    expect(
      a.items.some((i) =>
        ['RATE_LIMITING', 'PERFORMANCE', 'IDEMPOTENCY'].includes(i.category),
      ),
    ).toBe(false);
    expect(
      a.items.some(
        (i) =>
          i.ruleId === 'RISK_UNSECURED_MUTATION' &&
          i.statement.includes('GET /health'),
      ),
    ).toBe(false);
    expect(
      a.items
        .filter((i) => i.ruleId === 'RISK_STATE_SET')
        .some((i) => i.statement.includes('currency')),
    ).toBe(false);
    expect(a.items.some((i) => i.statement.includes('must transition'))).toBe(
      false,
    );
    expect(
      a.items.some((i) => i.statement.includes('vulnerability confirmed')),
    ).toBe(false);
  });
  it('does not flag declared error coverage as missing', () =>
    expect(
      deriveQa(context()).items.some(
        (i) =>
          i.ruleId === 'RISK_ERROR_GAP' &&
          i.statement.startsWith('GET /users '),
      ),
    ).toBe(false));
  it('pins graph/import scope and rejects duplicate analysis items', () => {
    const c = context();
    c.snapshot.graph.importId = c.snapshot.id;
    expect(() => deriveQa(c)).toThrow('mismatch');
    const a = deriveQa(context());
    a.items.push(a.items[0]!);
    expect(() => assertQaAnalysis(a)).toThrow('Duplicate');
  });
  it('keeps review edits separate from original content and requires approval again', () => {
    const p = deriveQa(context()).items[0]!;
    const item: QaItem = {
      ...p,
      id: 'i',
      analysisId: 'a',
      createdAt: 't',
      createdBy: 'u',
      reviews: [
        {
          id: 'r',
          itemId: 'i',
          actorId: 'u',
          createdAt: 't',
          decision: 'APPROVE',
          rationale: 'Reviewed',
          title: null,
          statement: null,
        },
        {
          id: 'r2',
          itemId: 'i',
          actorId: 'u',
          createdAt: 't',
          decision: 'EDIT',
          rationale: 'Clarification',
          title: 'Edited title',
          statement: 'Edited statement',
        },
      ],
    };
    expect(reviewState(item)).toEqual({
      status: 'PROPOSED',
      title: 'Edited title',
      statement: 'Edited statement',
      edited: true,
    });
    expect(item.statement).toBe(p.statement);
    expect(canReview('MEMBER', 'APPROVE')).toBe(false);
    expect(canReview('MEMBER', 'EDIT')).toBe(true);
    expect(canReview('OWNER', 'REJECT')).toBe(true);
  });
  it('supports source/entity/status/requirement queries', () => {
    const c = context();
    const items = deriveQa(c).items.map((p, i) => ({
      ...p,
      id: String(i),
      analysisId: 'a',
      createdAt: 't',
      createdBy: 'u',
      reviews: [],
    }));
    const requirement = items.find(
      (i) =>
        i.kind === 'REQUIREMENT' &&
        risksForRequirement(items, i.logicalKey).length,
    )!;
    expect(itemsForNode(items, requirement.nodeRefs[0]!)).toContain(
      requirement,
    );
    expect(
      itemsBySourcePointer(items, requirement.sourcePointers[0]!),
    ).toContain(requirement);
    expect(itemsByStatus(items, 'PROPOSED')).toHaveLength(items.length);
  });
});
describe('AI trust boundary (mock provider only)', () => {
  it('works completely without a provider', async () =>
    expect((await analyzeQa(context())).aiStatus).toBe('NOT_CONFIGURED'));
  it('accepts validated proposals as AI inference only', async () => {
    const c = context();
    const a = await analyzeQa(c, provider({ proposals: [valid(c)] }));
    expect(a.aiStatus).toBe('SUCCEEDED');
    expect(a.items.at(-1)).toMatchObject({
      sourceKind: 'AI_PROPOSED',
      derivationType: 'AI_INFERENCE',
    });
    expect(a.aiMetadata?.validated).toBe(true);
  });
  it('deduplicates repeated AI proposals', async () => {
    const c = context(),
      p = valid(c);
    expect(
      (await analyzeQa(c, provider({ proposals: [p, p] }))).items.filter(
        (i) => i.sourceKind === 'AI_PROPOSED',
      ),
    ).toHaveLength(1);
  });
  it.each([
    'invalid json',
    'unknown category',
    'invented ref',
    'cross scope',
    'oversized',
    'approved',
    'ownership',
    'invented pointer',
  ])('isolates %s', async (kind) => {
    const c = context();
    const p: Record<string, unknown> = { ...valid(c) };
    if (kind === 'unknown category') p['category'] = 'MAGIC';
    if (
      kind === 'invented ref' ||
      kind === 'cross scope' ||
      kind === 'invented pointer'
    )
      p['evidenceRefs'] = ['#/invented-or-cross-project'];
    if (kind === 'oversized') p['statement'] = 'x'.repeat(4001);
    if (kind === 'approved') p['status'] = 'APPROVED';
    if (kind === 'ownership') p['workspaceId'] = 'forged';
    const a = await analyzeQa(
      c,
      provider(kind === 'invalid json' ? '{bad' : { proposals: [p] }),
    );
    expect(a.aiStatus).toBe('FAILED');
    expect(a.items).toEqual(deriveQa(c).items);
  });
  it.each(['rate limited', 'unavailable'])(
    'isolates provider %s',
    async (message) => {
      const c = context();
      const a = await analyzeQa(c, {
        providerId: 'mock',
        modelId: 'mock',
        analyze: async () => {
          throw new Error(message);
        },
      });
      expect(a.aiStatus).toBe('FAILED');
      expect(a.items).toEqual(deriveQa(c).items);
    },
  );
  it('times out without destroying deterministic results', async () => {
    const c = context();
    expect(
      (
        await analyzeQa(
          c,
          {
            providerId: 'mock',
            modelId: 'mock',
            analyze: () => new Promise(() => {}),
          },
          5,
        )
      ).aiStatus,
    ).toBe('FAILED');
  });
  it('keeps malicious descriptions inert and excludes free text/secrets from the request', async () => {
    const c = context();
    let request = '';
    await analyzeQa(c, {
      providerId: 'mock',
      modelId: 'mock',
      analyze: async (r) => {
        request = JSON.stringify(r);
        return { proposals: [] };
      },
    });
    expect(request).not.toContain('Ignore previous instructions');
    expect(request).not.toContain('secret-description');
    expect(request).not.toContain('example.invalid');
    expect(request).toContain('untrusted DATA');
  });
});

it('associates requirement/risk queries through explicit graph structure', () => {
  const c = context(),
    items = deriveQa(c).items.map((p, i) => ({
      ...p,
      id: String(i),
      analysisId: 'fixture',
      createdAt: c.source.createdAt,
      createdBy: c.source.createdBy,
      reviews: [],
    }));
  const op = c.snapshot.graph.nodes.find(
      (n) => n.type === 'OPERATION' && n.label === 'POST /users',
    )!,
    resource = c.snapshot.graph.nodes.find((n) => n.type === 'RESOURCE')!,
    schema = c.snapshot.graph.nodes.find((n) => n.type === 'SCHEMA')!;
  expect(
    requirementsForOperation(items, c.snapshot.graph, op.id).length,
  ).toBeGreaterThan(0);
  expect(
    requirementsForResource(items, c.snapshot.graph, resource.id).length,
  ).toBeGreaterThan(0);
  expect(requirementsForSchema(items, schema.id)).toEqual(
    itemsForNode(items, schema.id, 'REQUIREMENT'),
  );
  expect(
    risksForOperation(items, c.snapshot.graph, op.id).length,
  ).toBeGreaterThan(0);
  expect(
    risksForResource(items, c.snapshot.graph, resource.id).length,
  ).toBeGreaterThan(0);
});
it('keeps AI proposal logical identities stable across provider order', async () => {
  const c = context(),
    a = valid(c),
    b = {
      ...a,
      title: 'Second review question',
      statement: 'Clarify a second business invariant.',
    };
  const x = await analyzeQa(c, provider({ proposals: [a, b] })),
    y = await analyzeQa(c, provider({ proposals: [b, a] }));
  expect(
    x.items
      .filter((i) => i.sourceKind === 'AI_PROPOSED')
      .map((i) => i.logicalKey)
      .sort(),
  ).toEqual(
    y.items
      .filter((i) => i.sourceKind === 'AI_PROPOSED')
      .map((i) => i.logicalKey)
      .sort(),
  );
});
it('rejects malformed successful AI provenance', async () => {
  const a = await analyzeQa(
    context(),
    provider({ proposals: [valid(context())] }),
  );
  a.aiMetadata!.provider = 'x'.repeat(201);
  expect(() => assertQaAnalysis(a)).toThrow();
});
