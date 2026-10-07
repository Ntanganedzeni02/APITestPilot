import {
  safeBody,
  redactHeaders,
  safeContentType,
} from '../../../../../packages/evidence/src/index';
import { it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RunsView } from './runs-view';
import type { ExecutionRun } from '@testpilot/domain';
vi.mock('../findings/action-form', () => ({
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
vi.mock('./action-form', () => ({
  ExecutionActionForm: ({
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
const run: ExecutionRun = {
  id: 'fixture',
  workspace_id: 'workspace',
  project_id: 'project',
  environment_id: 'development',
  plan_id: 'plan',
  case_id: 'case',
  config_id: 'config',
  status: 'PENDING_APPROVAL',
  requested_by: 'user',
  created_at: '2026-10-07T00:00:00Z',
  started_at: null,
  completed_at: null,
  decision: 'REQUIRES_APPROVAL',
  policy_version: '1.0.0',
  reason_codes: ['EXPLICIT_EXECUTION_APPROVAL_REQUIRED'],
  fingerprint: 'a'.repeat(64),
  approved_fingerprint: null,
  request: null,
  result: null,
  cancel_requested: false,
};
it('empty Runs shows no fake execution result', () => {
  const html = renderToStaticMarkup(<RunsView runs={[]} role="OWNER" />);
  expect(html).toContain('No execution runs yet');
  expect(html).not.toContain('PASSED');
});
it('member cannot approve privileged execution', () => {
  const html = renderToStaticMarkup(<RunsView runs={[run]} role="MEMBER" />);
  expect(html).not.toContain('Approve this exact request');
  expect(html).toContain('No observed response');
});
it('owner approval binds fingerprint, BLOCK offers no override', () => {
  expect(
    renderToStaticMarkup(<RunsView runs={[run]} role="OWNER" />),
  ).toContain('name="fingerprint"');
  expect(
    renderToStaticMarkup(
      <RunsView
        runs={[{ ...run, status: 'BLOCKED', decision: 'BLOCK' }]}
        role="OWNER"
      />,
    ),
  ).not.toContain('Approve this exact request');
});
it('actual observation distinguishes expected, outcome and defect authority', () => {
  const html = renderToStaticMarkup(
    <RunsView
      role="OWNER"
      runs={[
        {
          ...run,
          status: 'COMPLETED',
          result: {
            outcome: 'FAILED',
            sent: true,
            failure: null,
            response: {
              status: 400,
              headers: { 'set-cookie': '[REDACTED]' },
              body: '<script>inert</script>',
              bodyHandling: 'TEXT',
              contentType: 'text/plain',
              bytes: 22,
              durationMs: 10,
              observedAt: run.created_at,
            },
            assertions: [
              {
                kind: 'STATUS_EQUALS',
                expected: 200,
                pointer: '#/response',
                status: 'FAIL',
                actual: '400',
                reason: 'Declared comparison',
              },
            ],
          },
        },
      ]}
    />,
  );
  expect(html).toContain('Expected: 200');
  expect(html).toContain('Observed: 400');
  expect(html).toContain('not a confirmed defect');
  expect(html).not.toContain('<script>inert</script>');
});

it('sanitized persisted response renders without hostile keys/header markers', () => {
  const marker = 'fixture-sensitive-marker';
  const raw = JSON.stringify({
    [marker]: [{ token: marker, nested: { [marker]: marker } }],
  });
  const type = 'application/json; token=' + marker;
  const body = safeBody(raw, type);
  const html = renderToStaticMarkup(
    <RunsView
      role="OWNER"
      runs={[
        {
          ...run,
          status: 'COMPLETED',
          result: {
            outcome: 'OBSERVED',
            sent: true,
            failure: null,
            assertions: [],
            response: {
              status: 200,
              headers: redactHeaders({
                'content-type': type,
                'cache-control': 'token=' + marker,
                'set-cookie': marker,
              }),
              body: body.body,
              bodyHandling: body.handling,
              contentType: safeContentType(type),
              bytes: raw.length,
              durationMs: 1,
              observedAt: '2026-10-07T00:00:00.000Z',
            },
          },
        },
      ]}
    />,
  );
  expect(html).not.toContain(marker);
  expect(html).toContain('field_0');
  expect(html).toContain('[REDACTED]');
});

it('unexpected failure values are never rendered verbatim', () => {
  const html = renderToStaticMarkup(
    <RunsView
      role="OWNER"
      runs={[
        {
          ...run,
          status: 'ERROR',
          result: {
            outcome: 'ERROR',
            sent: false,
            response: null,
            assertions: [],
            failure: 'BEARER_FIXTURE_CREDENTIAL_123' as unknown as NonNullable<
              ExecutionRun['result']
            >['failure'],
          },
        },
      ]}
    />,
  );
  expect(html).not.toContain('BEARER_FIXTURE_CREDENTIAL_123');
  expect(html).toContain('Execution failed.');
});
it('known failure is presented as safe mapped text', () => {
  const html = renderToStaticMarkup(
    <RunsView
      role="OWNER"
      runs={[
        {
          ...run,
          status: 'ERROR',
          result: {
            outcome: 'ERROR',
            sent: false,
            response: null,
            assertions: [],
            failure: 'TIMEOUT',
          },
        },
      ]}
    />,
  );
  expect(html).toContain('Execution timed out.');
  expect(html).not.toContain('TIMEOUT');
});

it('completed run links to real derived findings without changing execution authority', () => {
  const finding = {
    id: 'fixture-finding',
    title: 'Fixture finding',
  } as import('@testpilot/domain').Finding;
  const html = renderToStaticMarkup(
    <RunsView
      runs={[
        {
          ...run,
          status: 'COMPLETED',
          result: {
            outcome: 'FAILED',
            sent: false,
            response: null,
            failure: null,
            assertions: [],
          },
        },
      ]}
      role="MEMBER"
      evidence={[
        { runId: run.id, packageId: 'fixture-package', findings: [finding] },
      ]}
    />,
  );
  expect(html).toContain('/findings/fixture-finding');
  expect(html).toContain('fixture-package');
  expect(html).not.toContain('Approve this exact request');
});
