import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FindingsList, FindingDetailView } from './findings-view';
import type { FindingDetail } from '@testpilot/database';
import type { Finding } from '@testpilot/domain';
vi.mock('./action-form', () => ({
  FindingActionForm: ({
    children,
    label,
  }: {
    children: React.ReactNode;
    label: string;
  }) => (
    <form>
      {children}
      <button>{label}</button>
    </form>
  ),
}));
const f: Finding = {
  id: 'fixture-finding',
  workspace_id: 'fixture-workspace',
  project_id: 'fixture-project',
  environment_id: 'fixture-environment',
  case_id: 'fixture-case',
  first_package_id: 'fixture-package',
  fingerprint: 'a'.repeat(64),
  assertion_key: 'b'.repeat(64),
  rule: 'ASSERTION_FAILED',
  title: 'Fixture status assertion failure',
  summary: 'Explicitly labeled rendering fixture.',
  status: 'CANDIDATE',
  severity: 'MEDIUM',
  confidence: 'HIGH',
  source: 'DETERMINISTIC',
  revision: 0,
  occurrence_count: 1,
  first_observed_at: '2026-10-07',
  last_observed_at: '2026-10-07',
  operation: { method: 'GET', pointer: '#/paths/~1fixture/get' },
};
const detail: FindingDetail = {
  finding: f,
  occurrences: [
    {
      id: 'fixture-occurrence',
      finding_id: f.id,
      package_id: f.first_package_id,
      assertion_index: 0,
      observed_at: '2026-10-07',
    },
  ],
  packages: [
    {
      id: f.first_package_id,
      workspace_id: f.workspace_id,
      project_id: f.project_id,
      environment_id: f.environment_id,
      run_id: 'fixture-run',
      config_id: 'fixture-config',
      plan_id: 'fixture-plan',
      scenario_id: 'fixture-scenario',
      case_id: f.case_id,
      fingerprint: 'c'.repeat(64),
      created_at: '2026-10-07',
      version: '1',
    },
  ],
  items: [
    {
      id: 'fixture-item',
      package_id: f.first_package_id,
      kind: 'ASSERTION_RESULT',
      assertion_index: 0,
    },
  ],
  runs: [],
  reviews: [],
  traceability: [
    {
      qa_item_id: 'fixture-requirement',
      qa_kind: 'REQUIREMENT',
      plan_id: 'fixture-plan',
    },
  ],
};
it('empty findings never claim an API is defect-free', () => {
  const html = renderToStaticMarkup(<FindingsList findings={[]} />);
  expect(html).toContain('No findings yet');
  expect(html).toContain('does not establish');
  expect(html).not.toContain('CONFIRMED');
});
it('renders operation, confidence, severity, count and navigation', () => {
  const html = renderToStaticMarkup(<FindingsList findings={[f]} />);
  for (const value of [
    'GET #/paths/~1fixture/get',
    'MEDIUM severity',
    'HIGH confidence',
    'Human decision required',
    '/findings/fixture-finding',
    '1 evidence-backed',
  ])
    expect(html).toContain(value);
});
it('detail exposes exact source references and assertion item', () => {
  const html = renderToStaticMarkup(<FindingDetailView detail={detail} />);
  for (const value of [
    'ASSERTION_RESULT #0',
    '/runs#run-fixture-run',
    'fixture-config',
    'fixture-requirement',
    'c'.repeat(64),
  ])
    expect(html).toContain(value);
});
it('review requires an explicit choice and carries stale-state revision', () => {
  const html = renderToStaticMarkup(<FindingDetailView detail={detail} />);
  expect(html).toContain('Select a decision');
  expect(html).toContain('name="revision"');
  expect(html).toContain('maxLength="1000"');
  expect(html).not.toContain('Review saved');
});
it('already-reviewed finding has no overwrite controls', () => {
  const html = renderToStaticMarkup(
    <FindingDetailView
      detail={{ ...detail, finding: { ...f, status: 'CONFIRMED' } }}
    />,
  );
  expect(html).toContain('Subsequent occurrences preserve');
  expect(html).not.toContain('name="mode"');
});
it('untrusted text is escaped rather than executed', () => {
  const html = renderToStaticMarkup(
    <FindingsList findings={[{ ...f, title: '<script>fixture</script>' }]} />,
  );
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});
