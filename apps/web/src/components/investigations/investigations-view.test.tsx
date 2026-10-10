import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvestigationsList, InvestigationDetail } from './investigations-view';
import {
  fixture,
  proposal,
  id,
} from '../../../../../packages/domain/tests/curiosity-fixture.js';
vi.mock('./action-form', () => ({
  InvestigationActionForm: ({
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
it('honest empty list', () =>
  expect(
    renderToStaticMarkup(<InvestigationsList investigations={[]} />),
  ).toContain('No investigations'));
it('real list status and link', () =>
  expect(
    renderToStaticMarkup(
      <InvestigationsList investigations={[fixture().investigation]} />,
    ),
  ).toContain('/investigations/' + id));
it('detail shows source budgets and provider limitation', () => {
  const c = fixture();
  c.investigation.expires_at = new Date(Date.now() + 60000).toISOString();
  const html = renderToStaticMarkup(
    <InvestigationDetail context={c} canApprove />,
  );
  expect(html).toContain('Generate AI hypotheses');
  expect(html).toContain('Proposals 0/8');
  expect(html).toContain('Persisted source evidence');
});
it('exact proposal controls and no HTTP authority', () => {
  const c = fixture();
  c.investigation.expires_at = new Date(Date.now() + 60000).toISOString();
  c.proposals = [
    {
      ...proposal(),
      id,
      investigation_id: id,
      status: 'PROPOSED',
      fingerprint: 'a'.repeat(64),
      approved_fingerprint: null,
      revision: 7,
      operation_id: 'fixture-operation',
      run_id: null,
      result_package_id: null,
      depth: 0,
    },
  ];
  const html = renderToStaticMarkup(
    <InvestigationDetail context={c} canApprove />,
  );
  expect(html).toContain('Approve exact proposal');
  expect(html).toContain('value="7"');
  expect(html).toContain('proposal approval cannot authorize HTTP');
  expect(html).not.toContain('Request execution through M1.7');
});
it('member cannot see approval controls', () => {
  const c = fixture();
  c.proposals = [
    {
      ...proposal(),
      id,
      investigation_id: id,
      status: 'PROPOSED',
      fingerprint: 'f',
      approved_fingerprint: null,
      revision: 0,
      operation_id: 'fixture',
      run_id: null,
      result_package_id: null,
      depth: 0,
    },
  ];
  expect(
    renderToStaticMarkup(
      <InvestigationDetail context={c} canApprove={false} />,
    ),
  ).not.toContain('Approve exact proposal');
});
it('prose safely escaped', () => {
  const c = fixture();
  c.proposals = [
    {
      ...proposal(),
      rationale: '<script>fixture</script>',
      id,
      investigation_id: id,
      status: 'BLOCKED',
      fingerprint: 'f',
      approved_fingerprint: null,
      revision: 0,
      operation_id: 'fixture',
      run_id: null,
      result_package_id: null,
      depth: 0,
    },
  ];
  const html = renderToStaticMarkup(
    <InvestigationDetail context={c} canApprove />,
  );
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('Safety: Blocked');
});
