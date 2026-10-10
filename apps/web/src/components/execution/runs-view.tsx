import { SearchableList } from '../ui/searchable-list';
import { TechnicalDetails } from '../api-map/spec-details';
import { StatusBadge, Disclosure, EmptyState } from '../ui/product';
import { entityName } from '../../lib/display';
import { LocalTime } from '../ui/local-time';
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
  executionAvailable = false,
}: {
  runs: ExecutionRun[];
  role: WorkspaceRole;
  executionAvailable?: boolean;
  evidence?: { runId: string; packageId: string; findings: Finding[] }[];
}) {
  return (
    <div className="min-w-0 space-y-4">
      {!runs.length && (
        <EmptyState
          title="No execution runs yet."
          description="Configure an environment and select an approved test case. Execution still requires an independent safety decision."
          href="/tests"
          action="Review test plans"
        />
      )}
      <SearchableList
        label="Search runs"
        rows={runs.map((run) => ({
          id: run.id,
          searchText: [
            entityName('Execution', 'Run', run.id),
            run.status,
            run.request?.method ?? '',
            run.request?.operationPointer ?? '',
          ].join(' '),
          content: (
            <details
              id={'run-' + run.id}
              key={run.id}
              className="product-card break-words"
            >
              <summary className="cursor-pointer">
                <span className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-medium">
                    {entityName('Execution', 'Run', run.id)}
                  </span>
                  <StatusBadge value={run.status} />
                </span>
                <span className="mt-2 block text-xs text-muted-foreground">
                  {run.request?.method ?? 'Request pending'} |{' '}
                  <LocalTime value={run.created_at} />
                </span>
                {run.recovery_outcome === 'INDETERMINATE' && (
                  <span className="mt-2 block text-xs text-warning">
                    Delivery unknown. Human reconciliation required; no
                    automatic replay.
                  </span>
                )}
              </summary>
              <Disclosure title="Execution context and technical audit details">
                <p>
                  Environment: {run.environment_id}; plan: {run.plan_id}; case:{' '}
                  {run.case_id}
                </p>
                <p>
                  Requested by: {run.requested_by}; created:{' '}
                  <LocalTime value={run.created_at} />
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
              </Disclosure>
              {run.recovery_outcome === 'INDETERMINATE' && (
                <p role="alert">
                  INDETERMINATE: delivery or completion is unknown. Human
                  reconciliation is required before another execution. This is
                  not a confirmed API defect. TestPilot will not automatically
                  replay this run.
                </p>
              )}
              {run.cancel_requested && (
                <p>
                  Cancellation requested. A sent remote operation cannot be
                  undone.
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
                    One case: {run.result.outcome}; sent:{' '}
                    {String(run.result.sent)}. Assertion failure is not a
                    confirmed defect.
                  </p>
                  <section>
                    <h3>Evidence and findings</h3>
                    <InvestigationActionForm label="Investigate completed run">
                      <input type="hidden" name="mode" value="DERIVE" />
                      <input type="hidden" name="runId" value={run.id} />
                    </InvestigationActionForm>
                    {evidence.find((e) => e.runId === run.id) ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Evidence package:{' '}
                          <span>
                            Recorded; inspect the finding for package
                            provenance.
                          </span>
                        </p>
                        <TechnicalDetails
                          value={evidence.find((e) => e.runId === run.id)}
                          label="Technical details: evidence package and findings"
                        />
                        {evidence
                          .find((e) => e.runId === run.id)
                          ?.findings.map((f) => (
                            <p key={f.id}>
                              <Link href={'/findings/' + f.id}>{f.title}</Link>{' '}
                              / {f.status}
                            </p>
                          ))}
                        {!evidence.find((e) => e.runId === run.id)?.findings
                          .length && (
                          <p>
                            No finding candidates were classified from this
                            result.
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
                    <ExecutionActionForm
                      label="Approve this exact request"
                      disabled={!executionAvailable}
                    >
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
          ),
        }))}
      />
    </div>
  );
}
