import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceOverview, type OverviewData } from './workspace-overview';
const data: OverviewData = {
  project: 'Labeled UI fixture',
  workspace: 'Test workspace',
  environment: 'DEVELOPMENT',
  current: null,
  historical: false,
  operations: null,
  requirements: null,
  approved: null,
  pending: null,
  runs: null,
  planCoverage: null,
  activity: [],
  activityUnavailable: false,
};
it('missing evidence never invents quality, activity or passing progress', () => {
  const html = renderToStaticMarkup(<WorkspaceOverview data={data} />);
  expect(html).toContain('Not enough evidence yet');
  expect(html).toContain('Unavailable');
  expect(html).toContain('not activated');
  expect(html).not.toContain('<progress');
  expect(html).toContain('No activity appears in the loaded history');
  expect(html).toContain('href="/ask"');
});
it('unavailable assessment and activity are distinguished from empty evidence', () => {
  const html = renderToStaticMarkup(
    <WorkspaceOverview
      data={{ ...data, qualityUnavailable: true, activityUnavailable: true }}
    />,
  );
  expect(html).toContain('Quality unavailable');
  expect(html).toContain('could not be verified');
  expect(html).toContain('Activity is unavailable');
  expect(html).not.toContain('No activity appears in the loaded history');
});
it('real scoped planning counts remain separate from execution evidence', () => {
  const html = renderToStaticMarkup(
    <WorkspaceOverview
      data={{
        ...data,
        operations: 4,
        requirements: 2,
        approved: 2,
        pending: 1,
        runs: 0,
        planCoverage: { covered: 2, total: 2 },
        activity: [
          {
            id: 'fixture-plan',
            title: 'Recorded fixture plan',
            href: '/tests?analysis=fixture-analysis&plan=fixture-plan',
            createdAt: '2026-10-09T12:00:00Z',
          },
        ],
      }}
    />,
  );
  expect(html).toContain('2 of 2');
  expect(html).toContain('Planning links are not execution evidence');
  expect(html).toContain('Recorded fixture plan');
  expect(html).toContain('Not enough evidence yet');
});
