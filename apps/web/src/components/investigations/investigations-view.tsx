import { SearchableList } from '../ui/searchable-list';
import { StatusBadge, Disclosure, EmptyState } from '../ui/product';
import { TechnicalDetails } from '../api-map/spec-details';
import { entityName, readableStatus } from '../../lib/display';
import { LocalTime } from '../ui/local-time';
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
    <SearchableList
      label="Search investigations"
      rows={investigations.map((i) => ({
        id: i.id,
        searchText: [readableStatus(i.trigger), i.status].join(' '),
        content: (
          <article key={i.id} className="product-card">
            <Link href={'/investigations/' + i.id}>
              {readableStatus(i.trigger)} <StatusBadge value={i.status} />
            </Link>
            <p>
              Created <LocalTime value={i.created_at} />; expires{' '}
              <LocalTime value={i.expires_at} />. Proposals{' '}
              {i.proposalCount ?? 0}; completed steps {i.executedStepCount ?? 0}
              ; latest activity{' '}
              <LocalTime value={i.latestActivity ?? i.created_at} />
            </p>
            {i.status === 'WAITING_FOR_APPROVAL' && <p>Human review needed</p>}
          </article>
        ),
      }))}
    />
  ) : (
    <EmptyState
      title="No investigations."
      description="Start from a persisted finding or completed run. Hypotheses are not confirmed defects."
      href="/findings"
      action="Review findings"
    />
  );
}
export function InvestigationDetail({
  context,
  canApprove,
  aiProposalIds = [],
  aiProvenanceUnavailable = false,
}: {
  context: CuriosityContext;
  canApprove: boolean;
  aiProposalIds?: string[];
  aiProvenanceUnavailable?: boolean;
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
      <h1 className="page-title">
        {entityName('Evidence', 'Investigation', i.id)}
      </h1>
      {aiProvenanceUnavailable && (
        <p role="status">
          AI provenance is unavailable; suggestions are not verified evidence.
        </p>
      )}
      <p>
        {i.status} ? {i.trigger}
      </p>
      <section>
        <h2>Why TestPilot investigated</h2>
        <TechnicalDetails
          value={{ packageId: i.source_package_id }}
          label="Persisted source evidence"
        />
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
          Expires <LocalTime value={i.expires_at} />.{' '}
          {active
            ? 'Open for bounded actions.'
            : 'Closed or expired for new proposals/executions.'}
        </p>
      </section>
      {active && (
        <section>
          <h2>Propose a follow-up</h2>
          <p>
            Select a trusted approved case or request AI suggestions. AI reasons
            about supplied evidence; it cannot approve or execute follow-ups.
            Unknown operations and unsupported observed-value bindings are
            rejected.
          </p>
          <InvestigationActionForm label="Generate AI hypotheses">
            {hidden('GENERATE_AI')}
            <p>
              Grounded repeatability suggestions only; existing investigation
              budgets and human review remain required.
            </p>
          </InvestigationActionForm>
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
                        {c.method} | {entityName('Test', 'Case', c.id)}
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
                        {entityName('Completed', 'Step', p.id)}
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
                      {entityName('Test', 'Case', b.caseId)} | {b.field} |{' '}
                      {b.parameterPointer}
                    </option>
                  ))}
                </select>
              </label>
              {context.evidence.map((e) => (
                <label className="block" key={e.id}>
                  <input type="checkbox" name="evidenceItemId" value={e.id} />
                  {readableStatus(e.kind)} |{' '}
                  {entityName('Evidence', 'Item', e.id)}
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
          <details key={p.id} className="product-card">
            <summary className="cursor-pointer">
              <span className="font-medium">
                {entityName('Follow-up', 'Proposal', p.id)}
              </span>{' '}
              <StatusBadge value={p.status} />
            </summary>
            <h3>
              {readableStatus(p.status)} |{' '}
              {entityName('Test', 'Case', p.caseId)}
            </h3>
            {aiProposalIds.includes(p.id) && (
              <p>
                AI-generated suggestion ? not verified evidence or a confirmed
                finding.
              </p>
            )}
            <p>{p.hypothesis}</p>
            <p>{p.rationale}</p>
            <p>
              Confidence: {p.confidence} (proposal only). Operation:{' '}
              {entityName('API', 'Operation', p.operation_id)}. Depth: {p.depth}
              .
            </p>
            <p>
              Bindings: none; existing immutable case input and declared
              assertions apply.
            </p>
            <Disclosure title="Evidence, dependency and approval provenance">
              {' '}
              <p>Evidence: {p.evidenceItemIds.join(', ')}</p>
              <p>Dependency: {p.dependencyId ?? 'Source observation'}</p>
              <p>
                Human approval: {p.approved_by ?? 'Not approved'}; exact
                fingerprint {p.fingerprint}.
              </p>
            </Disclosure>
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
                Resulting evidence package recorded. Resulting findings remain
                in <Link href="/findings">Findings</Link>.
              </p>
            )}
            <TechnicalDetails
              value={p}
              label="Technical details: exact proposal provenance"
            />
          </details>
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
      <Disclosure title="Audit trail">
        {context.audit?.map((event) => (
          <p key={event.id}>
            {event.event} ? <LocalTime value={event.created_at} /> ? actor{' '}
            {event.actor_id}
          </p>
        ))}
      </Disclosure>
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
