'use client';
import { useState } from 'react';
import {
  planningState,
  planningCoverage,
  traceabilityRows,
  executionEligibility,
  canReview,
  type TestPlan,
  type GraphSnapshot,
  type WorkspaceRole,
} from '@testpilot/domain';
import { PlanningActionForm } from './action-form';
export function PlanningView({
  plan,
  graph,
  role,
  risks = [],
}: {
  plan: TestPlan;
  graph: GraphSnapshot;
  role: WorkspaceRole;
  risks?: { id: string; title: string }[];
}) {
  const [view, setView] = useState('SCENARIO'),
    [status, setStatus] = useState('ALL'),
    [origin, setOrigin] = useState('ALL'),
    [priority, setPriority] = useState('ALL'),
    [type, setType] = useState('ALL'),
    [reference, setReference] = useState(''),
    [eligibility, setEligibility] = useState('ALL');
  const coverage = planningCoverage(
    plan,
    graph.graph.nodes.filter((n) => n.type === 'OPERATION').map((n) => n.id),
  );
  const filtered = plan.records.filter(
    (i) =>
      i.kind === view &&
      (status === 'ALL' || planningState(i).status === status) &&
      (origin === 'ALL' || i.origin === origin) &&
      (priority === 'ALL' || i.priority === priority) &&
      (type === 'ALL' || i.testType === type) &&
      (!reference ||
        [
          ...i.requirementRefs,
          ...i.riskRefs,
          ...i.nodeRefs,
          i.scenarioKey,
        ].includes(reference)) &&
      (eligibility === 'ALL' || executionEligibility(i, plan) === eligibility),
  );
  return (
    <section className="min-w-0 mt-5 space-y-4">
      <h2 className="text-xl font-semibold">Test plan</h2>
      <p className="break-all text-xs">
        Plan {plan.id} | Analysis {plan.analysisId} | Import {plan.importId} |
        Graph {plan.graphId} | Engine {plan.engineVersion} | {plan.createdAt}
      </p>
      <p>
        AI:{' '}
        {plan.aiStatus === 'NOT_CONFIGURED'
          ? 'unavailable / not configured'
          : plan.aiStatus}
      </p>
      {plan.aiFailure && <p role="status">{plan.aiFailure}</p>}
      <p>
        {coverage.coveredRequirements}/{coverage.approvedRequirements} approved
        requirements covered; {coverage.scenarios} scenarios; {coverage.cases}{' '}
        cases; {coverage.approvedCases} approved cases;{' '}
        {coverage.executionEligible} planning eligible; {coverage.blocked}{' '}
        blocked by setup.
      </p>
      <p>
        Planning eligibility never authorizes execution. No API requests or
        runtime results exist.
      </p>
      <details className="rounded border p-3">
        <summary>Add a human-authored planning proposal</summary>
        <PlanningActionForm label="Add human proposal">
          <input type="hidden" name="mode" value="ADD" />
          <input type="hidden" name="planId" value={plan.id} />
          <label className="form-label">
            Kind
            <select name="kind" className="form-input">
              <option>SCENARIO</option>
              <option>CASE</option>
            </select>
          </label>
          <label className="form-label">
            Existing scenario traceability template
            <select name="scenarioKey" className="form-input">
              {plan.records
                .filter((i) => i.kind === 'SCENARIO')
                .map((i) => (
                  <option key={i.id} value={i.logicalKey}>
                    {planningState(i).title}
                  </option>
                ))}
            </select>
          </label>
          <label className="form-label">
            Title
            <input
              name="title"
              required
              maxLength={160}
              className="form-input"
            />
          </label>
          <label className="form-label">
            Objective
            <textarea
              name="objective"
              required
              maxLength={4000}
              className="form-input"
            />
          </label>
          <label className="form-label">
            Expected behavior
            <textarea
              name="expectedBehavior"
              required
              maxLength={4000}
              className="form-input"
            />
          </label>
          <label className="form-label">
            Why this test exists
            <textarea
              name="reason"
              required
              maxLength={2000}
              className="form-input"
            />
          </label>
        </PlanningActionForm>
        <p>
          Human proposals retain template evidence and are review-only; no
          credentials or personal data.
        </p>
      </details>
      <nav aria-label="Planning views" className="flex flex-wrap gap-3">
        {[
          ['SCENARIO', 'Scenarios'],
          ['CASE', 'Test Cases'],
          ['COVERAGE', 'Coverage'],
          ['TRACEABILITY', 'Traceability'],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={view === value}
            onClick={() => setView(value!)}
            className="rounded border px-3 py-2"
          >
            {label}
          </button>
        ))}
      </nav>
      {view === 'COVERAGE' ? (
        <div>
          <h3>Coverage gaps</h3>
          {risks
            .filter(
              (r) =>
                !plan.records.some(
                  (i) =>
                    i.kind === 'CASE' &&
                    i.riskRefs.includes(r.id) &&
                    i.requirementRefs.some((id) =>
                      plan.requirements.some(
                        (q) => q.id === id && q.status === 'APPROVED',
                      ),
                    ),
                ),
            )
            .map((r) => (
              <p key={'approved-gap:' + r.id}>
                Coverage gap - risk has no approved testable requirement:{' '}
                {r.title}
              </p>
            ))}

          {coverage.uncoveredRequirements.map((r) => (
            <p key={r.id}>
              Approved requirement without active scenario: {r.title}
            </p>
          ))}
          {risks
            .filter((r) => !coverage.linkedRisks.includes(r.id))
            .map((r) => (
              <p key={r.id}>Risk without linked test coverage: {r.title}</p>
            ))}
          {coverage.uncoveredOperations.map((id) => (
            <p key={id} className="break-all">
              Operation without planned coverage:{' '}
              {graph.graph.nodes.find((n) => n.id === id)?.label ?? id}
            </p>
          ))}
          <p>
            Uncovered means missing planned evidence, not a defect. Risk
            coverage cannot replace a testable requirement.
          </p>
        </div>
      ) : view === 'TRACEABILITY' ? (
        <div>
          {traceabilityRows(plan).map((row) => (
            <details key={row.requirement.id} className="rounded border p-3">
              <summary>
                {row.requirement.title} - {row.requirement.status}
              </summary>
              <p className="break-all">
                Requirement {row.requirement.id}; review{' '}
                {row.requirement.reviewId ?? 'unreviewed'}
              </p>
              <p>Risks: {row.riskRefs.join(', ') || 'None'}</p>
              {row.scenarios.map((s) => (
                <p key={s.id}>Scenario: {planningState(s).title}</p>
              ))}
              {row.cases.map((c) => (
                <p key={c.id}>
                  Case: {planningState(c).title}; {planningState(c).status};{' '}
                  {executionEligibility(c, plan)}
                </p>
              ))}
            </details>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [
                'Review status',
                status,
                setStatus,
                ['ALL', 'PROPOSED', 'APPROVED', 'REJECTED'],
              ],
              [
                'Origin',
                origin,
                setOrigin,
                ['ALL', 'DETERMINISTIC', 'AI_PROPOSED', 'HUMAN_AUTHORED'],
              ],
              [
                'Priority',
                priority,
                setPriority,
                ['ALL', 'ROUTINE', 'HIGH', 'URGENT'],
              ],
              [
                'Test type',
                type,
                setType,
                ['ALL', ...new Set(plan.records.map((i) => i.testType))],
              ],
              [
                'Eligibility',
                eligibility,
                setEligibility,
                [
                  'ALL',
                  'REVIEW_REQUIRED',
                  'APPROVED_FOR_EXECUTION',
                  'NON_EXECUTABLE',
                  'BLOCKED_BY_DEPENDENCY',
                ],
              ],
            ].map(([label, value, setter, options]) => (
              <label key={label as string} className="form-label">
                {label as string}
                <select
                  className="form-input"
                  value={value as string}
                  onChange={(e) =>
                    (setter as (v: string) => void)(e.target.value)
                  }
                >
                  {(options as string[]).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
            ))}
            <label className="form-label">
              Operation / resource / requirement / risk
              <select
                className="form-input"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              >
                <option value="">All references</option>
                {plan.requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
                {risks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
                {graph.graph.nodes
                  .filter(
                    (n) => n.type === 'OPERATION' || n.type === 'RESOURCE',
                  )
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <p>
            Showing {Math.min(filtered.length, 50)} of {filtered.length}{' '}
            proposals.
          </p>
          {filtered.slice(0, 50).map((item) => {
            const state = planningState(item);
            return (
              <details key={item.id} className="rounded border p-3 break-words">
                <summary>
                  {state.title} - {state.status}
                </summary>
                <p>{state.objective}</p>
                <p>
                  {item.testType} / {item.caseType ?? 'Objective'} /{' '}
                  {item.priority}
                </p>
                <p>Why: {item.reason}</p>
                <p>
                  Rule: {item.ruleId}; origin: {item.origin}; derivation:{' '}
                  {item.derivationType}; confidence: {item.confidence}
                </p>
                <p>Priority: {item.priorityReason}</p>
                <p>Expected: {state.expectedBehavior}</p>
                <p>
                  Setup:{' '}
                  {item.preconditions.map((p) => p.kind).join(', ') ||
                    'No explicit setup requirement'}
                </p>
                <p>Symbolic input: {JSON.stringify(item.input)}</p>
                <p>Eligibility: {executionEligibility(item, plan)}</p>
                <details>
                  <summary>Provenance and traceability</summary>
                  <p className="break-all">
                    Requirements: {item.requirementRefs.join(', ')}; Risks:{' '}
                    {item.riskRefs.join(', ') || 'None'}; Scenario:{' '}
                    {item.scenarioKey ?? 'This objective'}
                  </p>
                  <p className="break-all">
                    Graph: {item.nodeRefs.join(', ')} {item.edgeRefs.join(', ')}
                  </p>
                  <p className="break-all">
                    Source: {item.sourcePointers.join(', ')}
                  </p>
                  <p>
                    Original: {item.title}; {item.objective};{' '}
                    {item.expectedBehavior}
                  </p>
                </details>
                <details>
                  <summary>Review history ({item.reviews.length})</summary>
                  {item.reviews.map((r) => (
                    <p key={r.id}>
                      {r.revision}: {r.decision} by {r.actorId} - {r.rationale}
                    </p>
                  ))}
                </details>
                <PlanningActionForm label="Record review">
                  <input type="hidden" name="mode" value="REVIEW" />
                  <input type="hidden" name="itemId" value={item.id} />
                  <input
                    type="hidden"
                    name="expectedReviewId"
                    value={item.reviews.at(-1)?.id ?? ''}
                  />
                  <label className="form-label">
                    Decision
                    <select name="decision" className="form-input">
                      {['APPROVE', 'REJECT', 'EDIT']
                        .filter((d) => canReview(role, d as 'EDIT'))
                        .map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                    </select>
                  </label>
                  <label className="form-label">
                    Rationale
                    <textarea
                      name="rationale"
                      maxLength={2000}
                      className="form-input"
                    />
                  </label>
                  <label className="form-label">
                    Edited title
                    <input
                      name="title"
                      defaultValue={state.title}
                      maxLength={160}
                      className="form-input"
                    />
                  </label>
                  <label className="form-label">
                    Edited objective
                    <textarea
                      name="objective"
                      defaultValue={state.objective}
                      maxLength={4000}
                      className="form-input"
                    />
                  </label>
                  <label className="form-label">
                    Edited expected behavior
                    <textarea
                      name="expectedBehavior"
                      defaultValue={state.expectedBehavior}
                      maxLength={4000}
                      className="form-input"
                    />
                  </label>
                </PlanningActionForm>
              </details>
            );
          })}
        </>
      )}
    </section>
  );
}
