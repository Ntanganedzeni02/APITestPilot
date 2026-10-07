import { it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const m = vi.hoisted(() => ({
  context: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock('./context', () => ({ intelligenceContext: m.context }));
vi.mock('../../components/memory-quality/action-form', () => ({
  IntelligenceActionForm: () => <button>Refresh Memory</button>,
}));
import Memory from '../../app/(product)/memory/page';
import Detail from '../../app/(product)/memory/[factId]/page';
beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.context.mockResolvedValue({
    workspace: { id: 'w' },
    project: { id: 'p' },
    environment: { id: 'e', type: 'DEVELOPMENT' },
    environments: [{ id: 'e', type: 'DEVELOPMENT' }],
    repo: { listFacts: m.list, detail: m.detail },
  });
  m.list.mockResolvedValue([]);
});
it('empty memory never fabricates knowledge', async () => {
  const html = renderToStaticMarkup(
    await Memory({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain('No matching observations');
  expect(html).toContain('blocked and cancelled runs do not prove behavior');
});
it('no project gives controlled empty state', async () => {
  m.context.mockResolvedValue(null);
  expect(
    renderToStaticMarkup(await Memory({ searchParams: Promise.resolve({}) })),
  ).toContain('Select a project');
  expect(m.list).not.toHaveBeenCalled();
});
it('database error gives safe error state', async () => {
  m.list.mockRejectedValue(Error('private'));
  const html = renderToStaticMarkup(
    await Memory({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain('role="alert"');
  expect(html).not.toContain('private');
});
it('passes filters and bounded pagination with tenant context', async () => {
  await Memory({
    searchParams: Promise.resolve({
      kind: 'ASSERTION_FAILURE_OBSERVED',
      currentness: 'CURRENT',
      operation: 'known',
      page: '2',
    }),
  });
  expect(m.list).toHaveBeenCalledWith('w', 'p', 'e', {
    kind: 'ASSERTION_FAILURE_OBSERVED',
    currentness: 'CURRENT',
    operation: 'known',
    page: 2,
  });
});
it('fact shows provenance currentness environment and counts without raw bodies', async () => {
  m.detail.mockResolvedValue({
    fact: {
      id: 'f',
      kind: 'ASSERTION_FAILURE_OBSERVED',
      currentness: 'HISTORICAL',
      operation_id: 'GET /fixture',
      environment_id: 'e',
      api_import_id: 'source',
      graph_id: 'graph',
      case_id: 'case',
      first_observed_at: 'first',
      last_observed_at: 'last',
      observation_count: 3,
    },
    observations: [
      {
        id: 'o',
        claim: 'FAILED',
        run_id: 'run',
        package_id: 'package',
        evidence_item_id: 'item',
        observed_at: 'time',
        finding_id: 'finding',
        review_id: 'review',
        investigation_id: 'investigation',
      },
    ],
  });
  const html = renderToStaticMarkup(
    await Detail({
      params: Promise.resolve({ factId: 'f' }),
      searchParams: Promise.resolve({}),
    }),
  );
  for (const text of [
    'HISTORICAL',
    'DEVELOPMENT',
    'Count: 3',
    '/memory/evidence/o',
    '/findings/finding',
    '/investigations/investigation',
    'Human review review',
    'run-run',
  ])
    expect(html).toContain(text);
  expect(html).not.toContain('Authorization');
});

it('persisted absent operation displays honest fallback with provenance', async () => {
  m.detail.mockResolvedValue({
    fact: {
      id: 'f',
      kind: 'INVESTIGATION_CONCLUDED',
      currentness: 'CURRENT',
      operation_id: null,
      environment_id: 'e',
      api_import_id: 'source',
      graph_id: 'graph',
      case_id: 'case',
      first_observed_at: 'first',
      last_observed_at: 'last',
      observation_count: 1,
    },
    observations: [
      {
        id: 'o',
        claim: 'STOPPED_BY_POLICY',
        run_id: 'run',
        package_id: 'package',
        investigation_id: 'investigation',
        observed_at: 'time',
      },
    ],
  });
  const html = renderToStaticMarkup(
    await Detail({
      params: Promise.resolve({ factId: 'f' }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(html).toContain('Operation unavailable');
  expect(html).toContain('investigation');
});
