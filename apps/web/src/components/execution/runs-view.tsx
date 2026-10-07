import { InvestigationActionForm } from '../investigations/action-form';
import Link from 'next/link';
import type { Finding } from '@testpilot/domain';
import { FindingActionForm } from '../findings/action-form';
import { executionFailureMessage } from '@testpilot/domain';
import type { ExecutionRun, WorkspaceRole } from '@testpilot/domain';
import { ExecutionActionForm } from './action-form';
export function RunsView({
  runs,
  role,
  evidence = [],
}: {
  runs: ExecutionRun[];
  role: WorkspaceRole;
  evidence?: { runId: string; packageId: string; findings: Finding[] }[];
}) {
  return (
    <div className="min-w-0 space-y-4">
      {!runs.length && (
        <p>
          No execution runs yet. Configure an environment and select an approved
          test case.
        </p>
      )}
      {runs.map((run) => (
        <details
          id={'run-' + run.id}
          key={run.id}
          className="min-w-0 rounded border p-4 break-words"
        >
          <summary>
            Run {run.id} - {run.status}
          </summary>
          <p>
            Environment: {run.environment_id}; plan: {run.plan_id}; case:{' '}
            {run.case_id}
          </p>
          <p>
            Requested by: {run.requested_by}; created: {run.created_at}
          </p>
          <p>
            Started: {run.started_at ?? 'Not started'}; completed:{' '}
            {run.completed_at ?? 'Not completed'}
          </p>
          <p>
            Safety: {run.decision ?? 'Not evaluated'}; policy:{' '}
            {run.policy_version ?? 'Pending'}
          </p>
          <p>
            Reasons:{' '}
            {run.reason_codes.join(', ') || 'Pending worker evaluation'}
          </p>
          <p>Request fingerprint: {run.fingerprint ?? 'Pending'}</p>
          {run.cancel_requested && (
            <p>
              Cancellation requested. A sent remote operation cannot be undone.
            </p>
          )}
          {run.request && (
            <>
              <h3>Authorized request (safe representation)</h3>
              <pre className="max-w-full whitespace-pre-wrap break-all">
                {JSON.stringify(run.request, null, 2)}
              </pre>
            </>
          )}
          {run.result ? (
            <>
              <p>
                One case: {run.result.outcome}; sent: {String(run.result.sent)}.
                Assertion failure is not a confirmed defect.
              </p>
              <section>
                <h3>Evidence and findings</h3>
                <InvestigationActionForm label="Investigate completed run">
                  <input type="hidden" name="mode" value="DERIVE" />
                  <input type="hidden" name="runId" value={run.id} />
                </InvestigationActionForm>
                {evidence.find((e) => e.runId === run.id) ? (
                  <>
                    <p>
                      Evidence package:{' '}
                      {evidence.find((e) => e.runId === run.id)?.packageId}
                    </p>
                    {evidence
                      .find((e) => e.runId === run.id)
                      ?.findings.map((f) => (
                        <p key={f.id}>
                          <Link href={'/findings/' + f.id}>{f.title}</Link> /{' '}
                          {f.status}
                        </p>
                      ))}
                    {!evidence.find((e) => e.runId === run.id)?.findings
                      .length && (
                      <p>
                        No finding candidates were classified from this result.
                      </p>
                    )}
                  </>
                ) : (
                  <FindingActionForm label="Derive evidence and finding candidates">
                    <input type="hidden" name="mode" value="DERIVE" />
                    <input type="hidden" name="runId" value={run.id} />
                  </FindingActionForm>
                )}
              </section>
              {run.result.failure && (
                <p>
                  Execution failure:{' '}
                  {executionFailureMessage(run.result.failure)}
                </p>
              )}
              {run.result.response && (
                <>
                  <h3>Observed response</h3>
                  <p>
                    Status: {run.result.response.status}; duration:{' '}
                    {run.result.response.durationMs}ms; captured:{' '}
                    {run.result.response.bytes} bytes; body:{' '}
                    {run.result.response.bodyHandling}
                  </p>
                  <pre className="max-w-full whitespace-pre-wrap break-all">
                    {JSON.stringify(run.result.response.headers, null, 2)}
                  </pre>
                  <pre className="max-w-full whitespace-pre-wrap break-all">
                    {run.result.response.body ?? 'No retained body'}
                  </pre>
                </>
              )}
              {run.result.assertions.map((a, n) => (
                <div key={n} className="rounded border p-2">
                  <p>
                    {a.kind}: {a.status}
                  </p>
                  <p>Expected: {JSON.stringify(a.expected)}</p>
                  <p>Observed: {a.actual}</p>
                  <p>Provenance: {a.pointer}</p>
                  <p>{a.reason}</p>
                </div>
              ))}
            </>
          ) : (
            <p>No observed response or execution evidence yet.</p>
          )}
          {run.status === 'PENDING_APPROVAL' &&
            ['OWNER', 'ADMIN'].includes(role) && (
              <>
                <ExecutionActionForm label="Approve this exact request">
                  <input type="hidden" name="mode" value="APPROVE" />
                  <input type="hidden" name="runId" value={run.id} />
                  <input
                    type="hidden"
                    name="fingerprint"
                    value={run.fingerprint ?? ''}
                  />
                </ExecutionActionForm>
                <ExecutionActionForm label="Reject request">
                  <input type="hidden" name="mode" value="REJECT" />
                  <input type="hidden" name="runId" value={run.id} />
                  <input
                    type="hidden"
                    name="fingerprint"
                    value={run.fingerprint ?? ''}
                  />
                </ExecutionActionForm>
              </>
            )}
          {!['COMPLETED', 'ERROR', 'BLOCKED', 'CANCELLED'].includes(
            run.status,
          ) && (
            <ExecutionActionForm label="Request cancellation">
              <input type="hidden" name="mode" value="CANCEL" />
              <input type="hidden" name="runId" value={run.id} />
            </ExecutionActionForm>
          )}
        </details>
      ))}
    </div>
  );
}
