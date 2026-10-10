'use client';
import { LocalTime } from '../ui/local-time';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { readableStatus, entityName } from '../../lib/display';
import {
  planningState,
  planningCoverage,
  traceabilityRows,
  executionEligibility,
  type TestPlan,
  type GraphSnapshot,
  type WorkspaceRole,
  type TestItem,
} from '@testpilot/domain';
import { PlanningActionForm } from './action-form';
import { FiltersPanel, activeFilterCount } from '../ui/filters-panel';
import { BulkReview } from '../ui/bulk-review';
import { bulkContextKey } from '../../lib/reviews/bulk';
import { ProposalReview } from './proposal-review';
import { readableProposalTitle } from '../../lib/display';
export const planningTabs = [
  ['SCENARIO', 'Scenarios'],
  ['CASE', 'Test Cases'],
  ['COVERAGE', 'Coverage'],
  ['TRACEABILITY', 'Traceability'],
] as const;
export function readinessLabel(value: string) {
  return (
    (
      {
        REVIEW_REQUIRED: 'Human review required',
        APPROVED_FOR_EXECUTION: 'Ready for safety review',
        NON_EXECUTABLE: 'Review only - cannot execute',
        BLOCKED_BY_DEPENDENCY: 'Setup required',
      } as Record<string, string>
    )[value] ?? readableStatus(value)
  );
}
export function filterPlanningItems(
  plan: TestPlan,
  view: string,
  filters: {
    status: string;
    origin: string;
    priority: string;
    type: string;
    reference: string;
    eligibility: string;
  },
) {
  return plan.records.filter(
    (i) =>
      i.kind === view &&
      (filters.status === 'ALL' ||
        planningState(i).status === filters.status) &&
      (filters.origin === 'ALL' || i.origin === filters.origin) &&
      (filters.priority === 'ALL' || i.priority === filters.priority) &&
      (filters.type === 'ALL' || i.testType === filters.type) &&
      (!filters.reference ||
        [
          ...i.requirementRefs,
          ...i.riskRefs,
          ...i.nodeRefs,
          i.scenarioKey,
        ].includes(filters.reference)) &&
      (filters.eligibility === 'ALL' ||
        executionEligibility(i, plan) === filters.eligibility),
  );
}
export function PlanningView({
  plan,
  graph,
  role,
  risks = [],
  initialView = 'SCENARIO',
  title,
  analysisName,
  bulkBlocked,
}: {
  plan: TestPlan;
  graph: GraphSnapshot;
  role: WorkspaceRole;
  risks?: { id: string; title: string }[];
  initialView?: string | undefined;
  title?: string;
  analysisName?: string;
  bulkBlocked?: string | undefined;
}) {
  const [view, setView] = useState(
      planningTabs.some(([value]) => value === initialView)
        ? initialView
        : 'SCENARIO',
    ),
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
  const filters = { status, origin, priority, type, reference, eligibility };
  const filtered: TestItem[] = filterPlanningItems(plan, view, filters);
  const visible = filtered.slice(0, 50);
  const bulkItems = visible.map((item) => ({
    id: item.id,
    title: planningState(item).title,
    label: `${item.kind === 'CASE' ? 'Test case' : 'Scenario'} ${plan.records.filter((r) => r.kind === item.kind).indexOf(item) + 1}: ${readableProposalTitle(planningState(item).title)}`,
    objective: planningState(item).objective,
    expectedBehavior: planningState(item).expectedBehavior,
    pending: !bulkBlocked && planningState(item).status === 'PROPOSED',
    expectedReviewId: item.reviews.at(-1)?.id ?? null,
  }));
  const activeFilters = activeFilterCount([
    ...[status, origin, priority, type, eligibility].map((value) => ({
      value,
      defaultValue: 'ALL',
    })),
    { value: reference, defaultValue: '' },
  ]);
  const resetFilters = () => {
    setStatus('ALL');
    setOrigin('ALL');
    setPriority('ALL');
    setType('ALL');
    setReference('');
    setEligibility('ALL');
  };
  const changeView = (value: string) => {
    setView(value);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', value);
      window.history.replaceState(null, '', url);
    }
  };
  useEffect(() => {
    const update = () => {
      const value = new URL(window.location.href).searchParams.get('view');
      setView(planningTabs.some(([v]) => v === value) ? value! : 'SCENARIO');
    };
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return (
    <section className="min-w-0 mt-5 space-y-4">
      <h2 className="text-xl font-semibold break-words">
        {title ?? entityName(undefined, 'Plan', plan.id)}
      </h2>
      <p className="text-sm text-muted-foreground">
        Based on{' '}
        {analysisName ?? entityName(undefined, 'Analysis', plan.analysisId)}.
        Review status: {readableStatus(plan.status)}.
      </p>
      <p className="text-sm text-muted-foreground">
        <LocalTime value={plan.createdAt} /> | {readableStatus(plan.status)} |{' '}
        {plan.aiStatus === 'SUCCEEDED'
          ? 'AI-assisted suggestions'
          : 'Standard planning'}
        . Human review required.
      </p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          Technical details and provenance
        </summary>
        <p className="mt-2 break-all">
          Plan {plan.id} | Analysis {plan.analysisId} | Import {plan.importId} |
          Graph {plan.graphId} | Engine {plan.engineVersion} | {plan.createdAt}
        </p>
        {plan.aiMetadata && (
          <p>
            Provider {plan.aiMetadata.provider}; model {plan.aiMetadata.model};
            prompt {plan.aiMetadata.promptVersion}.
          </p>
        )}
      </details>
      {plan.aiFailure && <p role="status">{plan.aiFailure}</p>}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[
          ['Scenarios', coverage.scenarios, 'Active planning objectives'],
          [
            'Test cases',
            coverage.cases,
            'Active cases, excluding rejected proposals',
          ],
          [
            'Approved test cases',
            coverage.approvedCases,
            'Human-approved cases',
          ],
          [
            'Requirement coverage',
            coverage.approvedRequirements
              ? `${coverage.coveredRequirements} of ${coverage.approvedRequirements}`
              : 'No approved snapshot requirements',
            coverage.approvedRequirements
              ? 'Approved requirements with planned coverage'
              : 'This historical plan snapshot has no approved requirements. After approval, create a new Standard plan and open it.',
          ],
          [
            'Execution-ready cases',
            coverage.executionEligible,
            'Planning eligible; safety authorization still required',
          ],
          [
            'Setup-blocked cases',
            coverage.blocked,
            'Cases blocked by dependencies',
          ],
        ].map(([label, count, description]) => (
          <div key={label} className="rounded-lg border border-border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-xl font-semibold">{count}</dd>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        ))}
      </dl>
      <p>
        Planning eligibility never authorizes execution. Planning records
        contain no runtime results; see Runs for observed execution.
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
      <div
        role="tablist"
        aria-label="Planning views"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {planningTabs.map(([value, label], index) => (
          <button
            key={value}
            id={`planning-tab-${value}`}
            role="tab"
            aria-selected={view === value}
            aria-controls="planning-panel"
            tabIndex={view === value ? 0 : -1}
            onClick={() => changeView(value)}
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? planningTabs.length - 1
                    : (index +
                        (event.key === 'ArrowRight' ? 1 : -1) +
                        planningTabs.length) %
                      planningTabs.length;
              changeView(planningTabs[next]![0]);
              const tabButtons =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              tabButtons?.[next]?.focus();
            }}
            className={`rounded-t px-3 py-2 text-sm focus-visible:outline focus-visible:outline-ring ${view === value ? 'border-b-2 border-primary font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id="planning-panel"
        role="tabpanel"
        aria-labelledby={`planning-tab-${view}`}
        tabIndex={0}
        className="focus-visible:outline focus-visible:outline-ring"
      >
        {view === 'COVERAGE' ? (
          <div>
            <h3 className="font-semibold">Coverage gaps</h3>
            {!coverage.approvedRequirements && (
              <p className="mt-2 text-sm text-muted-foreground">
                This plan saved no approved requirements. Existing scenarios and
                cases are proposals, not verified coverage or execution
                evidence.
              </p>
            )}
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
                {graph.graph.nodes.find((n) => n.id === id)?.label ??
                  'Unavailable operation'}
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
                  {row.requirement.title} -{' '}
                  {readableStatus(row.requirement.status)}
                </summary>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary>Technical references</summary>
                  <p className="break-all">
                    Requirement {row.requirement.id}; review{' '}
                    {row.requirement.reviewId ?? 'unreviewed'}; risks{' '}
                    {row.riskRefs.join(', ') || 'None'}
                  </p>
                </details>
                <p>
                  Risks:{' '}
                  {row.riskRefs
                    .map(
                      (id) =>
                        risks.find((r) => r.id === id)?.title ?? 'Linked risk',
                    )
                    .join(', ') || 'None'}
                </p>
                {!row.scenarios.length && (
                  <p className="text-sm text-muted-foreground">
                    No active scenarios linked to this requirement.
                  </p>
                )}
                {row.scenarios.map((s) => (
                  <p key={s.id}>Scenario: {planningState(s).title}</p>
                ))}
                {row.cases.map((c) => (
                  <p key={c.id}>
                    Case: {planningState(c).title};{' '}
                    {readableStatus(planningState(c).status)};{' '}
                    {readinessLabel(executionEligibility(c, plan))}
                  </p>
                ))}
              </details>
            ))}
          </div>
        ) : (
          <>
            <FiltersPanel
              activeCount={activeFilters}
              onClear={resetFilters}
              label="Test plan filters"
            >
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
                      <option key={o} value={o}>
                        {readableStatus(o)}
                      </option>
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
            </FiltersPanel>
            {activeFilters > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span>
                  Active filters:{' '}
                  {[status, origin, priority, type, eligibility]
                    .filter((v) => v !== 'ALL')
                    .map(readableStatus)
                    .join(', ')}
                  {reference ? ' | Selected reference' : ''}
                </span>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {Math.min(filtered.length, 50)} of {filtered.length}{' '}
              proposals.
            </p>
            {!filtered.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                No matching proposals. Adjust filters or add a review-only
                proposal.
              </p>
            )}
            {bulkBlocked && (
              <p role="status" className="text-sm text-muted-foreground">
                {bulkBlocked} Individual reviews remain available.
              </p>
            )}
            <BulkReview
              key={
                bulkContextKey(plan.id, view, bulkItems) +
                JSON.stringify([filters, role])
              }
              family="PLANNING"
              parentId={plan.id}
              kind={view}
              role={role}
              items={bulkItems}
            >
              {(checkbox) => (
                <>
                  {visible.map((item) => {
                    const state = planningState(item);
                    return (
                      <div key={item.id}>
                        {checkbox(item.id)}
                        <details className="rounded border p-3 break-words">
                          <summary className="cursor-pointer space-y-2 focus-visible:outline focus-visible:outline-ring">
                            <span className="block font-medium">
                              {readableProposalTitle(state.title)}
                            </span>
                            <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>{readableStatus(state.status)}</span>
                              <span>{readableStatus(item.priority)}</span>
                              <span>{readableStatus(item.testType)}</span>
                              <span>
                                {readinessLabel(
                                  executionEligibility(item, plan),
                                )}
                              </span>
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {item.nodeRefs
                                .map((id) =>
                                  graph.graph.nodes.find((n) => n.id === id),
                                )
                                .filter((node) => node?.type === 'OPERATION')
                                .map((node) => node!.label)
                                .join(' | ') || 'No endpoint linked'}
                            </span>
                            {item.kind === 'CASE' && (
                              <span className="block text-sm text-muted-foreground">
                                Expected: {state.expectedBehavior}
                              </span>
                            )}
                          </summary>
                          <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                            <div>
                              <h4 className="font-semibold">Objective</h4>
                              <p className="mt-1 whitespace-pre-wrap break-words">
                                {state.objective}
                              </p>
                              <p className="mt-2 text-muted-foreground">
                                {item.reason}
                              </p>
                            </div>
                            <div>
                              <h4 className="font-semibold">Expected result</h4>
                              <p className="mt-1 whitespace-pre-wrap break-words">
                                {state.expectedBehavior}
                              </p>
                            </div>
                            <div>
                              <h4 className="font-semibold">
                                Preconditions and setup
                              </h4>
                              <p>
                                {item.preconditions
                                  .map((p) => readableStatus(p.kind))
                                  .join(', ') ||
                                  'No explicit setup requirement'}
                              </p>
                            </div>
                            <div>
                              <h4 className="font-semibold">
                                Associated requirements and risks
                              </h4>
                              <p>
                                Requirements:{' '}
                                {item.requirementRefs
                                  .map(
                                    (id) =>
                                      plan.requirements.find((r) => r.id === id)
                                        ?.title ?? 'Linked requirement',
                                  )
                                  .join(', ') || 'None'}
                              </p>
                              <p>
                                Risks:{' '}
                                {item.riskRefs
                                  .map(
                                    (id) =>
                                      risks.find((r) => r.id === id)?.title ??
                                      'Linked risk',
                                  )
                                  .join(', ') || 'None'}
                              </p>
                            </div>
                          </div>
                          <div className="my-2 rounded-lg border border-border p-2 text-sm">
                            <h4 className="font-semibold">
                              Execution readiness
                            </h4>
                            <p>
                              {readinessLabel(executionEligibility(item, plan))}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Human review approval does not authorize
                              execution. Runs performs a separate safety
                              evaluation.
                            </p>
                            {item.kind === 'CASE' && (
                              <Link
                                className="mt-2 inline-block underline"
                                href={
                                  '/runs?plan=' + plan.id + '&case=' + item.id
                                }
                              >
                                Open safety preview
                              </Link>
                            )}
                          </div>
                          <h4 className="font-semibold">Human review</h4>
                          <p className="text-xs text-muted-foreground">
                            Record an approval, rejection or revision. Revised
                            proposals require review again.
                          </p>
                          <ProposalReview
                            key={`${item.id}-${item.reviews.at(-1)?.id ?? 'initial'}`}
                            item={item}
                            role={role}
                          />
                          <details className="mt-4">
                            <summary className="cursor-pointer text-sm">
                              Review history ({item.reviews.length})
                            </summary>
                            {!item.reviews.length && (
                              <p className="mt-2 text-sm text-muted-foreground">
                                No human review recorded yet.
                              </p>
                            )}
                            <ol className="mt-3 space-y-3 border-l border-border pl-4">
                              {item.reviews.map((r) => (
                                <li key={r.id} className="text-sm">
                                  <p className="font-medium">
                                    Revision {r.revision}:{' '}
                                    {readableStatus(r.decision)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    <LocalTime value={r.createdAt} />
                                  </p>
                                  <p className="whitespace-pre-wrap break-words">
                                    {r.rationale || 'No rationale provided'}
                                  </p>
                                  <details className="text-xs text-muted-foreground">
                                    <summary>Audit identifiers</summary>
                                    <p className="break-all">
                                      Review {r.id}; actor {r.actorId}
                                    </p>
                                  </details>
                                </li>
                              ))}
                            </ol>
                          </details>
                          <details>
                            <summary>Technical details</summary>
                            <details>
                              <summary>Full planning record</summary>
                              <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 whitespace-pre-wrap break-all text-xs">
                                {JSON.stringify(item, null, 2)}
                              </pre>
                            </details>
                            <p className="break-all">
                              Item ID: {item.id}; plan ID: {item.planId}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Full setup
                            </p>
                            <pre
                              aria-label="Full setup"
                              className="max-h-40 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap break-all text-xs"
                            >
                              {JSON.stringify(item.preconditions, null, 2)}
                            </pre>
                            <p className="break-all">
                              Rule: {item.ruleId}; origin: {item.origin};
                              derivation: {item.derivationType}; confidence:{' '}
                              {item.confidence}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Symbolic input
                            </p>
                            <pre
                              aria-label="Symbolic input"
                              className="max-h-40 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap break-all text-xs"
                            >
                              {JSON.stringify(item.input, null, 2)}
                            </pre>
                            <p className="break-all">
                              Requirements: {item.requirementRefs.join(', ')};
                              Risks: {item.riskRefs.join(', ') || 'None'};
                              Scenario: {item.scenarioKey ?? 'This objective'}
                            </p>
                            <p className="break-all">
                              Graph: {item.nodeRefs.join(', ')}{' '}
                              {item.edgeRefs.join(', ')}
                            </p>
                            <p className="break-all">
                              Source: {item.sourcePointers.join(', ')}
                            </p>
                            <p>
                              Original: {item.title}; {item.objective};{' '}
                              {item.expectedBehavior}
                            </p>
                          </details>
                        </details>
                      </div>
                    );
                  })}
                </>
              )}
            </BulkReview>
          </>
        )}
      </div>
    </section>
  );
}
