import { planReviewIsCurrent } from '../../../lib/reviews/bulk';
import { PageHeader } from '../../../components/ui/product';
import { LocalTime } from '../../../components/ui/local-time';
import { reviewState } from '@testpilot/domain';
import Link from 'next/link';
import {
  createQaRepository,
  createTestPlanRepository,
  createBehaviourGraphRepository,
  createApiKnowledgeRepository,
} from '@testpilot/database';
import { readAiConfig, AiReasoningError } from '@testpilot/ai/server';
import { requireUser } from '../../../lib/auth/server';
import { getTenantContext } from '../../../lib/tenancy/context';
import { entityName, readableStatus } from '../../../lib/display';
import { AnalysisSelect } from '../../../components/test-planning/analysis-select';
import { PlanningActionForm } from '../../../components/test-planning/action-form';
import { PlanningView } from '../../../components/test-planning/planning-view';
export default async function TestStudio({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project)
    return (
      <section>
        <PageHeader
          title="Test Studio"
          description="Turn intended behavior into reviewable plans and focused test cases."
        />
        <p>Select a project first.</p>
      </section>
    );
  try {
    const [analyses, plans, sources] = await Promise.all([
      createQaRepository(client).list(workspace.id, project.id),
      createTestPlanRepository(client).list(workspace.id, project.id),
      createApiKnowledgeRepository(client).list(workspace.id, project.id),
    ]);
    const requestedPlan = plans.find((p) => p.id === query['plan']);
    const selected =
      query['analysis'] === undefined
        ? (analyses.find((a) => a.id === requestedPlan?.analysisId) ??
          analyses[0])
        : analyses.find((a) => a.id === query['analysis']);
    const plan =
      query['plan'] === undefined
        ? plans.find((p) => p.analysisId === selected?.id)
        : requestedPlan?.analysisId === selected?.id
          ? requestedPlan
          : undefined;
    const sourceTitle = (id: string) =>
      sources.find((s) => s.id === id)?.knowledge.title;
    const analysisLabel = (a: (typeof analyses)[number]) =>
      entityName(sourceTitle(a.importId), 'Analysis', a.id);
    const approved = (a: (typeof analyses)[number]) =>
      a.records.filter(
        (r) => r.kind === 'REQUIREMENT' && reviewState(r).status === 'APPROVED',
      ).length;
    const approvedCount = selected ? approved(selected) : 0;
    const draftCount =
      selected?.records.filter(
        (r) => r.kind === 'REQUIREMENT' && reviewState(r).status === 'PROPOSED',
      ).length ?? 0;
    const riskCount =
      selected?.records.filter((r) => r.kind === 'RISK').length ?? 0;
    const [selectedGraph, planGraph] = await Promise.all([
      selected
        ? createBehaviourGraphRepository(client).list(
            workspace.id,
            project.id,
            selected.importId,
            selected.graphId,
          )
        : Promise.resolve([]),
      plan
        ? createBehaviourGraphRepository(client).list(
            workspace.id,
            project.id,
            plan.importId,
            plan.graphId,
          )
        : Promise.resolve([]),
    ]);
    let configurationReason: string | undefined;
    try {
      readAiConfig(process.env);
    } catch (error) {
      configurationReason =
        error instanceof AiReasoningError && error.code === 'DISABLED'
          ? 'AI is disabled for this server. Standard planning remains available.'
          : 'AI provider access is not configured. Ask an administrator to check server configuration.';
    }
    const eligibilityReason = !approvedCount
      ? 'Approve requirements for this analysis in Requirements, or choose an approved analysis.'
      : !selectedGraph.length
        ? 'The analysis graph is unavailable. Choose an analysis with complete source data.'
        : selected?.importId !== sources[0]?.id
          ? 'Choose an analysis for the current API import.'
          : undefined;
    const aiReason = eligibilityReason ?? configurationReason;
    const card = 'rounded-xl border border-border bg-card p-5';
    return (
      <div className="min-w-0 space-y-6">
        <header>
          <PageHeader
            title="Test Studio"
            description="Turn intended behavior into reviewable plans and focused test cases."
          />
          <p className="mt-2 text-sm text-muted-foreground">
            Turn requirements into a reviewable test plan. You decide what runs.
          </p>
        </header>
        <section className={card} aria-labelledby="analysis-heading">
          <h2 id="analysis-heading" className="text-lg font-semibold">
            Choose your analysis
          </h2>
          <div className="mt-4">
            <AnalysisSelect
              selectedId={selected?.id}
              options={analyses.map((a) => ({
                id: a.id,
                createdAt: a.createdAt,
                label: `${analysisLabel(a)} | ${approved(a) ? 'Approved requirements available' : 'Needs requirement approval'}`,
              }))}
            />
          </div>
          {selected ? (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="min-w-0 break-words font-medium">
                  {analysisLabel(selected)}
                </h3>
                <span className="rounded border border-border px-2 py-1 text-xs">
                  {eligibilityReason ? 'Needs attention' : 'Ready for planning'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Created <LocalTime value={selected.createdAt} />
              </p>
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ['Approved requirements', approvedCount],
                  ['Draft requirements', draftCount],
                  ['Identified risks', riskCount],
                ].map(([label, count]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-border p-3"
                  >
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-2xl font-semibold">{count}</dd>
                  </div>
                ))}
              </dl>
              {eligibilityReason && (
                <p role="status" className="mt-3 text-sm text-muted-foreground">
                  {eligibilityReason}{' '}
                  <Link className="underline" href="/requirements">
                    Open Requirements
                  </Link>
                </p>
              )}
              <details className="mt-4 text-xs text-muted-foreground">
                <summary className="cursor-pointer focus-visible:outline focus-visible:outline-ring">
                  Technical details
                </summary>
                <dl className="mt-2 space-y-2 break-all">
                  <div>
                    <dt>Analysis ID</dt>
                    <dd>{selected.id}</dd>
                  </div>
                  <div>
                    <dt>API import ID</dt>
                    <dd>{selected.importId}</dd>
                  </div>
                  <div>
                    <dt>Graph ID</dt>
                    <dd>{selected.graphId}</dd>
                  </div>
                  <div>
                    <dt>Created at (UTC)</dt>
                    <dd>{selected.createdAt}</dd>
                  </div>
                  <div>
                    <dt>Engine version</dt>
                    <dd>{selected.engineVersion}</dd>
                  </div>
                </dl>
              </details>
            </>
          ) : (
            <p role="alert" className="mt-4">
              {query['analysis'] !== undefined
                ? 'Selected analysis is unavailable in this project. No fallback was selected.'
                : 'No analyses yet. Generate requirements and risks to get started.'}{' '}
              <Link className="underline" href="/requirements">
                Open Requirements
              </Link>
            </p>
          )}
        </section>
        {selected && (
          <section aria-labelledby="create-heading">
            <h2 id="create-heading" className="text-lg font-semibold">
              Create a test plan
            </h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className={card}>
                <h3 className="font-semibold">Standard plan</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Build a repeatable plan from your specification and
                  requirements. No AI or provider credits required. Drafts need
                  human review.
                </p>
                <PlanningActionForm
                  key={`${selected.id}-standard`}
                  label="Create standard plan"
                >
                  <input type="hidden" name="mode" value="GENERATE" />
                  <input type="hidden" name="analysisId" value={selected.id} />
                </PlanningActionForm>
              </div>
              <div className={card}>
                <h3 className="font-semibold">AI-assisted plan</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Suggest additional test objectives using approved
                  requirements. Requires configured AI access and available
                  provider credits. Every suggestion needs human review.
                </p>
                {aiReason && (
                  <p
                    role="status"
                    className="mt-3 text-sm text-muted-foreground"
                  >
                    {aiReason}
                  </p>
                )}
                <PlanningActionForm
                  key={`${selected.id}-ai`}
                  label="Generate with AI"
                  disabled={!!aiReason}
                >
                  <input type="hidden" name="mode" value="GENERATE_AI" />
                  <input type="hidden" name="analysisId" value={selected.id} />
                </PlanningActionForm>
              </div>
            </div>
          </section>
        )}
        <section className={card} aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-lg font-semibold">
            Plan history
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Recent plans for this project. Opening a plan also selects its
            source analysis.
          </p>
          {!plans.length ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No test plans yet. Choose an analysis and create your first plan
              above.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {plans.map((p) => (
                <li key={p.id}>
                  <Link
                    aria-current={p.id === plan?.id ? 'page' : undefined}
                    className={`block rounded-lg border p-3 focus-visible:outline focus-visible:outline-ring ${p.id === plan?.id ? 'border-primary bg-accent' : 'border-border hover:bg-accent'}`}
                    href={`/tests?analysis=${p.analysisId}&plan=${p.id}`}
                  >
                    <span className="block break-words font-medium">
                      {entityName(sourceTitle(p.importId), 'Plan', p.id)}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      <LocalTime value={p.createdAt} /> |{' '}
                      {readableStatus(p.status)} |{' '}
                      {p.aiStatus === 'SUCCEEDED' ? 'AI-assisted' : 'Standard'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {query['plan'] !== undefined && !plan && (
            <p role="alert" className="mt-3">
              Selected plan is unavailable for this analysis. Choose a plan from
              this project history.
            </p>
          )}
        </section>
        {plan && (
          <section className={card}>
            {planGraph[0] ? (
              <PlanningView
                key={plan.id}
                plan={plan}
                bulkBlocked={
                  plan.importId !== sources[0]?.id
                    ? 'Bulk review is unavailable for a historical source.'
                    : !planReviewIsCurrent(plan, selected)
                      ? 'Requirements changed since this plan snapshot; regenerate the plan before bulk review.'
                      : undefined
                }
                graph={planGraph[0]}
                initialView={
                  typeof query['view'] === 'string' ? query['view'] : undefined
                }
                title={entityName(sourceTitle(plan.importId), 'Plan', plan.id)}
                analysisName={
                  selected ? analysisLabel(selected) : 'Recorded analysis'
                }
                role={workspace.role}
                risks={
                  selected?.records
                    .filter((r) => r.kind === 'RISK')
                    .map((r) => ({ id: r.id, title: r.title })) ?? []
                }
              />
            ) : (
              <p role="alert">This plan's graph is unavailable.</p>
            )}
          </section>
        )}
      </div>
    );
  } catch {
    return (
      <section>
        <PageHeader
          title="Test Studio"
          description="Turn intended behavior into reviewable plans and focused test cases."
        />
        <p role="alert">
          Test Studio could not load this project's planning data. Refresh the
          page or contact an administrator.
        </p>
      </section>
    );
  }
}
