import Link from 'next/link';
import {
  curiosityBudget,
  repeatabilityHypothesis,
  type CuriosityContext,
  type Investigation,
} from '@testpilot/domain';
import { InvestigationActionForm } from './action-form';
export function InvestigationsList({
  investigations,
}: {
  investigations: Investigation[];
}) {
  return investigations.length ? (
    <ul>
      {investigations.map((i) => (
        <li key={i.id} className="rounded border p-3">
          <Link href={'/investigations/' + i.id}>
            {i.trigger} ? {i.status}
          </Link>
          <p>
            Created {i.created_at}; expires {i.expires_at}. Proposals{' '}
            {i.proposalCount ?? 0}; completed steps {i.executedStepCount ?? 0};
            latest activity {i.latestActivity ?? i.created_at}
          </p>
          {i.status === 'WAITING_FOR_APPROVAL' && <p>Human review needed</p>}
        </li>
      ))}
    </ul>
  ) : (
    <p>No investigations. Start from a persisted finding or completed run.</p>
  );
}
export function InvestigationDetail({
  context,
  canApprove,
}: {
  context: CuriosityContext;
  canApprove: boolean;
}) {
  const { investigation: i, proposals } = context;
  const active =
    !['CONCLUDED', 'STOPPED'].includes(i.status) &&
    Date.parse(i.expires_at) > Date.now();
  const hidden = (mode: string) => (
    <>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="investigationId" value={i.id} />
    </>
  );
  return (
    <article className="space-y-5">
      <h1 className="page-title">Investigation</h1>
      <p>
        {i.status} ? {i.trigger}
      </p>
      <section>
        <h2>Why TestPilot investigated</h2>
        <p>Persisted source evidence: {i.source_package_id}</p>
        {i.source_finding_id && (
          <Link href={'/findings/' + i.source_finding_id}>Source finding</Link>
        )}
        <p>{repeatabilityHypothesis}</p>
        <p>
          This bounded hypothesis concerns declared assertion repeatability. It
          does not prove an arbitrary rationale or confirm a defect.
        </p>
      </section>
      <section>
        <h2>Budget and control</h2>
        <p>
          Proposals {proposals.length}/{curiosityBudget.proposed}; executable
          steps {proposals.filter((p) => p.run_id).length}/
          {curiosityBudget.executable}; maximum depth {curiosityBudget.depth};
          attempts per operation {curiosityBudget.repeats}.
        </p>
        <p>
          Expires {i.expires_at}.{' '}
          {active
            ? 'Open for bounded actions.'
            : 'Closed or expired for new proposals/executions.'}
        </p>
      </section>
      {active && (
        <section>
          <h2>Propose a follow-up</h2>
          <p>
            No AI provider is configured. Explicitly select a trusted approved
            case; no AI output is simulated. Unknown operations and unsupported
            observed-value bindings are rejected.
          </p>
          {context.cases.some((c) => c.executable) ? (
            <InvestigationActionForm label="Propose follow-up">
              {hidden('PROPOSE')}
              <label>
                Known case
                <select name="caseId">
                  {context.cases
                    .filter((c) => c.executable)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.method} ? {c.id}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Why this follow-up?
                <textarea name="rationale" required maxLength={1000} />
              </label>
              <label>
                Dependency
                <select name="dependencyId">
                  <option value="">Source observation</option>
                  {proposals
                    .filter((p) => p.status === 'EXECUTED')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        Completed step {p.id}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Eligible observed status binding
                <select name="bindingChoice">
                  <option value="">Use existing case input</option>
                  {context.observedValues.map((b, index) => (
                    <option
                      key={b.caseId + b.evidenceItemId + b.parameterPointer}
                      value={index}
                    >
                      Case {b.caseId} ? {b.field} ? {b.parameterPointer}
                    </option>
                  ))}
                </select>
              </label>
              {context.evidence.map((e) => (
                <label className="block" key={e.id}>
                  <input type="checkbox" name="evidenceItemId" value={e.id} />
                  {e.kind} ? {e.id}
                </label>
              ))}
            </InvestigationActionForm>
          ) : (
            <p>
              No approved graph-grounded follow-up cases are available. Review
              existing planning first. Unresolved dependencies remain blocked by
              M1.7.
            </p>
          )}
        </section>
      )}
      <section>
        <h2>What TestPilot wants to try / what happened</h2>
        {!proposals.length && <p>No proposals recorded.</p>}
        {proposals.map((p) => (
          <section key={p.id} className="rounded border p-3">
            <h3>
              {p.status} ? {p.caseId}
            </h3>
            <p>{p.hypothesis}</p>
            <p>{p.rationale}</p>
            <p>
              Confidence: {p.confidence} (proposal only). Operation:{' '}
              {p.operation_id}. Depth: {p.depth}.
            </p>
            <p>
              Bindings: none; existing immutable case input and declared
              assertions apply.
            </p>
            <p>Evidence: {p.evidenceItemIds.join(', ')}</p>
            <p>Dependency: {p.dependencyId ?? 'Source observation'}</p>
            <p>
              Human approval: {p.approved_by ?? 'Not approved'}; exact
              fingerprint {p.fingerprint}.
            </p>
            <p>
              Safety:{' '}
              {p.status === 'BLOCKED'
                ? 'Blocked'
                : p.run_id
                  ? 'See authoritative M1.7 run decision'
                  : 'Pending independent M1.7 safety evaluation; proposal approval cannot authorize HTTP.'}
            </p>
            {p.status === 'PROPOSED' &&
              active &&
              canApprove &&
              ['APPROVE', 'REJECT'].map((mode) => (
                <InvestigationActionForm
                  key={mode}
                  label={
                    mode === 'APPROVE'
                      ? 'Approve exact proposal'
                      : 'Reject proposal'
                  }
                >
                  {hidden(mode)}
                  <input type="hidden" name="proposalId" value={p.id} />
                  <input type="hidden" name="revision" value={p.revision} />
                  <input
                    type="hidden"
                    name="fingerprint"
                    value={p.fingerprint}
                  />
                </InvestigationActionForm>
              ))}
            {p.status === 'APPROVED' && active && (
              <InvestigationActionForm label="Request execution through M1.7">
                {hidden('MATERIALIZE')}
                <input type="hidden" name="proposalId" value={p.id} />
                <input type="hidden" name="fingerprint" value={p.fingerprint} />
              </InvestigationActionForm>
            )}
            {p.run_id && (
              <Link href={'/runs#run-' + p.run_id}>
                Execution and safety review
              </Link>
            )}
            {p.result_package_id && (
              <p>
                Resulting evidence package: {p.result_package_id}. Resulting
                findings remain in <Link href="/findings">Findings</Link>.
              </p>
            )}
          </section>
        ))}
      </section>
      {!['CONCLUDED', 'STOPPED'].includes(i.status) && (
        <section>
          <h2>Progress and conclusion</h2>
          {['REFRESH', 'CONCLUDE', 'STOP'].map((mode) => (
            <InvestigationActionForm
              key={mode}
              label={
                mode === 'REFRESH'
                  ? 'Load completed results and derive evidence'
                  : mode === 'CONCLUDE'
                    ? 'Conclude from resulting evidence'
                    : 'Stop investigation and cancel pending runs'
              }
            >
              {hidden(mode)}
            </InvestigationActionForm>
          ))}
        </section>
      )}
      <section>
        <h2>Audit trail</h2>
        {context.audit?.map((event) => (
          <p key={event.id}>
            {event.event} ? {event.created_at} ? actor {event.actor_id}
          </p>
        ))}
      </section>
      {i.conclusion && (
        <p>
          Conclusion: {i.conclusion}. Evidence:{' '}
          {i.conclusion_package_id ??
            'Stopped without claiming a hypothesis result.'}
        </p>
      )}
    </article>
  );
}
