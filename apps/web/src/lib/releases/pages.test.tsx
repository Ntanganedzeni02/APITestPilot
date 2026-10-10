import { it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  assessmentFixture,
  reportFixture,
  releaseFixture,
  id,
} from '../../../../../packages/database/tests/release-fixtures';
const m = vi.hoisted(() => ({
  context: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  source: vi.fn(),
  reports: vi.fn(),
  report: vi.fn(),
}));
vi.mock('./context', () => ({ releaseContext: m.context }));
vi.mock('../../components/releases/action-form', () => ({
  ReleaseActionForm: ({ mode }: { mode: string }) => <button>{mode}</button>,
}));
import Releases from '../../app/(product)/releases/page';
import Detail from '../../app/(product)/releases/[releaseId]/page';
import Reports from '../../app/(product)/reports/page';
import Report from '../../app/(product)/reports/[reportId]/page';
import { GET } from '../../app/(product)/reports/[reportId]/export/route';
beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.context.mockResolvedValue({
    workspace: { id, role: 'OWNER' },
    project: { id },
    environment: { id, type: 'DEVELOPMENT' },
    environments: [{ id, type: 'DEVELOPMENT' }],
    repo: {
      list: m.list,
      detail: m.detail,
      latestSource: m.source,
      reports: m.reports,
      report: m.report,
    },
  });
  m.list.mockResolvedValue([]);
  m.reports.mockResolvedValue([]);
  m.source.mockResolvedValue(id);
  m.detail.mockResolvedValue({
    release: releaseFixture(),
    current: assessmentFixture(),
    decision: null,
    assessments: [assessmentFixture()],
    decisions: [],
    reports: [],
  });
  m.report.mockResolvedValue(reportFixture());
});
it('empty release list never invents approval', async () => {
  const html = renderToStaticMarkup(
    await Releases({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain('No releases on this page');
  expect(html).not.toContain('Release fixture');
});
it('missing import prevents create UI', async () => {
  m.source.mockResolvedValue(null);
  const html = renderToStaticMarkup(
    await Releases({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain('Import an API');
  expect(html).not.toContain('>CREATE<');
});
it('MEMBER sees reads without owner action', async () => {
  const c = await m.context();
  c.workspace.role = 'MEMBER';
  m.context.mockResolvedValue(c);
  expect(
    renderToStaticMarkup(await Releases({ searchParams: Promise.resolve({}) })),
  ).not.toContain('>CREATE<');
});
it('detail separates CLEAR assessment from absent human decision', async () => {
  const html = renderToStaticMarkup(
    await Detail({
      params: Promise.resolve({ releaseId: id }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(html).toContain('Release assessment');
  expect(html).toContain('>Clear</span>');
  expect(html).toContain('authorizes no');
  expect(html).toContain('No human decision recorded');
  expect(html).toContain('Humans decide');
});
it('historical source warning is explicit', async () => {
  m.source.mockResolvedValue('new-source');
  expect(
    renderToStaticMarkup(
      await Detail({
        params: Promise.resolve({ releaseId: id }),
        searchParams: Promise.resolve({}),
      }),
    ),
  ).toContain('Source changed');
});
it('unknown quality remains unknown', async () => {
  const a = assessmentFixture();
  a.result.inputs.quality = null;
  a.result.status = 'INSUFFICIENT_EVIDENCE';
  m.detail.mockResolvedValue({
    release: releaseFixture(),
    current: a,
    decision: null,
    assessments: [],
    decisions: [],
    reports: [],
  });
  expect(
    renderToStaticMarkup(
      await Detail({
        params: Promise.resolve({ releaseId: id }),
        searchParams: Promise.resolve({}),
      }),
    ),
  ).toContain('No compatible current quality');
});
it('empty reports contain no fake cards', async () =>
  expect(
    renderToStaticMarkup(await Reports({ searchParams: Promise.resolve({}) })),
  ).toContain('No reports on this page'));
it('report renders its snapshot without fetching today state', async () => {
  const html = renderToStaticMarkup(
    await Report({ params: Promise.resolve({ reportId: id }) }),
  );
  expect(html).toContain('not recalculated');
  expect(html).toContain('No human decision recorded in this snapshot');
  expect(m.detail).not.toHaveBeenCalled();
});
it('report download is scoped and private', async () => {
  const r = await GET(new Request('http://127.0.0.1'), {
    params: Promise.resolve({ reportId: id }),
  });
  expect(r.status).toBe(200);
  expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(await r.json()).toEqual(reportFixture());
  expect(m.report).toHaveBeenCalledWith(id, id, id);
});
it('missing downloadable report returns 404', async () => {
  m.report.mockResolvedValue(null);
  expect(
    (
      await GET(new Request('http://127.0.0.1'), {
        params: Promise.resolve({ reportId: id }),
      })
    ).status,
  ).toBe(404);
});
it('database error is safe empty/error state', async () => {
  m.list.mockRejectedValue(Error('private credential'));
  const html = renderToStaticMarkup(
    await Releases({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain('role="alert"');
  expect(html).not.toContain('private credential');
});
