import {
  createExecutionRepository,
  createTenantService,
  createTestPlanRepository,
  createApiKnowledgeRepository,
  executionTarget,
} from '@testpilot/database';
import { constructExecution } from '@testpilot/test-engine';
import { executionEligibility } from '@testpilot/domain';
import { requireUser } from '../../../lib/auth/server';
import { getTenantContext } from '../../../lib/tenancy/context';
import { ExecutionActionForm } from '../../../components/execution/action-form';
import { RunsView } from '../../../components/execution/runs-view';
export default async function Runs({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project)
    return (
      <section>
        <h1 className="page-title">Runs</h1>
        <p>Select a project first.</p>
      </section>
    );
  try {
    const query = await searchParams,
      repo = createExecutionRepository(client);
    const [runs, configs, plans, environments] = await Promise.all([
      repo.list(workspace.id, project.id),
      repo.configs(workspace.id, project.id),
      createTestPlanRepository(client).list(workspace.id, project.id),
      createTenantService(client).getProjectEnvironments(
        workspace.id,
        project.id,
      ),
    ]);
    const plan = plans.find((p) => p.id === query['plan']) ?? plans[0],
      item =
        plan?.records.find(
          (i) => i.id === query['case'] && i.kind === 'CASE',
        ) ?? plan?.records.find((i) => i.kind === 'CASE');
    const environment =
      environments.find((e) => e.id === query['environment']) ??
      environments.find((e) => e.type === 'DEVELOPMENT');
    const config = configs.find((c) => c.environment_id === environment?.id);
    const source = plan
      ? (
          await createApiKnowledgeRepository(client).list(
            workspace.id,
            project.id,
            plan.importId,
          )
        )[0]
      : null;
    const preview =
      plan && item && source && environment && config
        ? constructExecution(
            plan,
            item,
            source,
            executionTarget(config, environment.type),
          )
        : null;
    return (
      <div className="min-w-0 space-y-6">
        <h1 className="page-title">Runs</h1>
        <p>
          Planning readiness is separate from network authorization. The runner
          evaluates safety and DNS before execution. No automatic retries or
          redirects.
        </p>
        {['OWNER', 'ADMIN'].includes(workspace.role) && (
          <details>
            <summary>Configure an explicit environment target</summary>
            <ExecutionActionForm label="Save target configuration">
              <input type="hidden" name="mode" value="CONFIGURE" />
              <label className="form-label">
                Environment
                <select name="environmentId" className="form-input">
                  {environments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Execution base URL
                <input
                  name="baseUrl"
                  type="url"
                  maxLength={2048}
                  required
                  placeholder="https://api.example.test"
                  className="form-input"
                />
              </label>
              <label>
                <input name="enabled" type="checkbox" /> Enable execution
              </label>
              <p>
                OpenAPI servers are not automatically selected. No credentials,
                query strings or userinfo. Private/internal targets are blocked.
                Changing the configuration invalidates pending approvals.
              </p>
            </ExecutionActionForm>
          </details>
        )}
        <section>
          <h2>Run an approved test case</h2>
          <form method="get">
            <label className="form-label">
              Case
              <select
                name="case"
                className="form-input"
                defaultValue={item?.id}
              >
                {plan?.records
                  .filter((i) => i.kind === 'CASE')
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
              </select>
            </label>
            <input type="hidden" name="plan" value={plan?.id ?? ''} />
            <label className="form-label">
              Environment
              <select
                name="environment"
                className="form-input"
                defaultValue={environment?.id}
              >
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.type}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded border p-2">Preview selection</button>
          </form>
          {item && plan ? (
            <>
              <p>Objective: {item.objective}</p>
              <p>Planning: {executionEligibility(item, plan)}</p>
              <p>
                Method: {preview?.request?.method ?? 'Not runnable'}; safe
                target:{' '}
                {preview?.request?.url ?? config?.base_url ?? 'Not configured'}
              </p>
              <p>
                Preliminary classification:{' '}
                {preview?.failure ??
                  (environment?.type === 'PRODUCTION' ||
                  preview?.sideEffects ||
                  (preview?.request &&
                    !['GET', 'HEAD', 'OPTIONS'].includes(
                      preview.request.method,
                    ))
                    ? 'REQUIRES_APPROVAL'
                    : 'READ_POLICY_PENDING_DNS')}
              </p>
              <p>
                Credentials:{' '}
                {preview?.credentialsRequired
                  ? 'CREDENTIAL_CONFIGURATION_REQUIRED'
                  : 'No credential injection supported'}
                ; dependency:{' '}
                {preview?.dependencyRequired
                  ? 'BLOCKED_BY_DEPENDENCY'
                  : 'No unresolved identifier dependency'}
              </p>
              <p>
                DNS and all safety facts are evaluated by the worker; this
                preview authorizes no request.
              </p>
              <ExecutionActionForm
                label="Request Run Test"
                disabled={!config?.enabled || !preview?.planningReady}
              >
                <input type="hidden" name="mode" value="REQUEST" />
                <input type="hidden" name="caseId" value={item.id} />
                <input
                  type="hidden"
                  name="environmentId"
                  value={environment?.id ?? ''}
                />
              </ExecutionActionForm>
            </>
          ) : (
            <p>
              No test cases available. Create and independently review a test
              plan first.
            </p>
          )}
        </section>
        <RunsView runs={runs} role={workspace.role} />
      </div>
    );
  } catch {
    return (
      <section>
        <h1 className="page-title">Runs</h1>
        <p role="alert">
          Unable to load execution data. Verify the M1.7 migration is available
          and try again.
        </p>
      </section>
    );
  }
}
