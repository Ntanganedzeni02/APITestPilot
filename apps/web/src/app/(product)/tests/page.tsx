import { reviewState } from '@testpilot/domain';
import Link from 'next/link';
import {
  createQaRepository,
  createTestPlanRepository,
  createBehaviourGraphRepository,
} from '@testpilot/database';
import { requireUser } from '../../../lib/auth/server';
import { getTenantContext } from '../../../lib/tenancy/context';
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
        <h1 className="page-title">Test Studio</h1>
        <p>Select a project first.</p>
      </section>
    );
  try {
    const analyses = await createQaRepository(client).list(
        workspace.id,
        project.id,
      ),
      plans = await createTestPlanRepository(client).list(
        workspace.id,
        project.id,
      );
    const selected =
      analyses.find((a) => a.id === query['analysis']) ?? analyses[0];
    const plan = plans.find((p) => p.id === query['plan']) ?? plans[0];
    const graph = plan
      ? (
          await createBehaviourGraphRepository(client).list(
            workspace.id,
            project.id,
            plan.importId,
            plan.graphId,
          )
        )[0]
      : null;
    return (
      <div className="min-w-0">
        <h1 className="page-title">Test Studio</h1>
        <p className="mt-3">
          Evidence-backed planning and independent human review. Execution
          requests require separate safety evaluation in Runs.
        </p>
        {selected ? (
          <>
            <form method="get" className="mt-4">
              <label className="form-label">
                Exact analysis snapshot
                <select
                  name="analysis"
                  defaultValue={selected.id}
                  className="form-input"
                >
                  {analyses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.createdAt} - {a.id}
                    </option>
                  ))}
                </select>
              </label>
              <button className="rounded border p-2">Select analysis</button>
            </form>
            <p className="break-all text-xs">
              Pinned analysis {selected.id}; graph {selected.graphId}; engine
              1.0.0. Proposed deterministic requirements produce drafts; all
              cases require human review.
            </p>
            <p>
              Approved requirements:{' '}
              {
                selected.records.filter(
                  (r) =>
                    r.kind === 'REQUIREMENT' &&
                    reviewState(r).status === 'APPROVED',
                ).length
              }
              ; draft requirements:{' '}
              {
                selected.records.filter(
                  (r) =>
                    r.kind === 'REQUIREMENT' &&
                    reviewState(r).status === 'PROPOSED',
                ).length
              }
              ; rejected requirements excluded:{' '}
              {
                selected.records.filter(
                  (r) =>
                    r.kind === 'REQUIREMENT' &&
                    reviewState(r).status === 'REJECTED',
                ).length
              }
              ; risks:{' '}
              {selected.records.filter((r) => r.kind === 'RISK').length}.
            </p>
            <PlanningActionForm label="Generate Test Plan">
              <input type="hidden" name="mode" value="GENERATE" />
              <input type="hidden" name="analysisId" value={selected.id} />
            </PlanningActionForm>
          </>
        ) : (
          <p className="mt-5">
            Analyze requirements and risks first.{' '}
            <Link href="/requirements">Open Requirements</Link>
          </p>
        )}
        {!plan ? (
          <p className="mt-5">
            No test plan yet. Without approved requirements, generated
            suggestions cannot be execution eligible.
          </p>
        ) : (
          <>
            <form method="get" className="mt-4">
              <label className="form-label">
                Plan history (latest 10)
                <select
                  name="plan"
                  defaultValue={plan.id}
                  className="form-input"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.createdAt} - {p.id}
                    </option>
                  ))}
                </select>
              </label>
              <button className="rounded border p-2">View plan</button>
            </form>
            {graph ? (
              <PlanningView
                plan={plan}
                graph={graph}
                role={workspace.role}
                risks={
                  analyses
                    .find((a) => a.id === plan.analysisId)
                    ?.records.filter((r) => r.kind === 'RISK')
                    .map((r) => ({ id: r.id, title: r.title })) ?? []
                }
              />
            ) : (
              <p role="alert">Pinned graph unavailable.</p>
            )}
          </>
        )}
      </div>
    );
  } catch {
    return (
      <section>
        <h1 className="page-title">Test Studio</h1>
        <p role="alert">
          Test planning is unavailable. Check that the reviewed M1.6 migration
          has been deployed before hosted use.
        </p>
      </section>
    );
  }
}
