import { Overview } from '../../components/empty-state/overview';
import { WorkspaceOverview } from '../../components/overview/workspace-overview';
import { intelligenceContext } from '../../lib/memory-quality/context';
import { requireUser } from '../../lib/auth/server';
import {
  createApiKnowledgeRepository,
  createQaRepository,
  createTestPlanRepository,
  createExecutionRepository,
} from '@testpilot/database';
import { reviewState, planningCoverage } from '@testpilot/domain';
import { entityName } from '../../lib/display';
export default async function Home() {
  const c = await intelligenceContext();
  if (!c) return <Overview createHref="/projects/new" />;
  try {
    const { client } = await requireUser();
    const [assessment, latestSource, imports, analyses, plans, runs] =
      await Promise.allSettled([
        c.repo.current(c.workspace.id, c.project.id, c.environment.id),
        c.repo.latestSource(c.workspace.id, c.project.id),
        createApiKnowledgeRepository(client).list(c.workspace.id, c.project.id),
        createQaRepository(client).list(c.workspace.id, c.project.id),
        createTestPlanRepository(client).list(c.workspace.id, c.project.id),
        createExecutionRepository(client).list(c.workspace.id, c.project.id),
      ]);
    const current =
      assessment.status === 'fulfilled' ? assessment.value.current : null;
    const source =
      imports.status === 'fulfilled' ? imports.value[0] : undefined;
    const analysis =
      analyses.status === 'fulfilled'
        ? analyses.value.find((a) => a.importId === source?.id)
        : undefined;
    const plan =
      plans.status === 'fulfilled'
        ? plans.value.find((p) => p.analysisId === analysis?.id)
        : undefined;
    const requirements = analysis?.records.filter(
      (r) => r.kind === 'REQUIREMENT',
    );
    const coverage = plan ? planningCoverage(plan) : null;
    const activity = [
      ...(imports.status === 'fulfilled'
        ? imports.value.map((i) => ({
            id: i.id,
            title: `Imported ${i.knowledge.title}`,
            href: '/api-map?import=' + i.id,
            createdAt: i.createdAt,
          }))
        : []),
      ...(plans.status === 'fulfilled'
        ? plans.value.map((p) => ({
            id: p.id,
            title: entityName('Test', 'Plan', p.id),
            href: `/tests?analysis=${p.analysisId}&plan=${p.id}`,
            createdAt: p.createdAt,
          }))
        : []),
      ...(runs.status === 'fulfilled'
        ? runs.value
            .filter((r) => r.environment_id === c.environment.id)
            .map((r) => ({
              id: r.id,
              title: entityName('Execution', 'Run', r.id),
              href: '/runs#run-' + r.id,
              createdAt: r.created_at,
            }))
        : []),
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return (
      <WorkspaceOverview
        data={{
          project: c.project.name,
          workspace: c.workspace.name,
          environment: c.environment.type,
          current,
          qualityUnavailable:
            assessment.status === 'rejected' ||
            latestSource.status === 'rejected',
          historical:
            !!current &&
            latestSource.status === 'fulfilled' &&
            current.api_import_id !== (latestSource.value ?? null),
          operations: source?.knowledge.operations.length ?? null,
          requirements: requirements?.length ?? null,
          approved:
            requirements?.filter((r) => reviewState(r).status === 'APPROVED')
              .length ?? null,
          pending:
            analysis?.records.filter(
              (r) => reviewState(r).status === 'PROPOSED',
            ).length ?? null,
          runs:
            runs.status === 'fulfilled'
              ? runs.value.filter((r) => r.environment_id === c.environment.id)
                  .length
              : null,
          planCoverage: coverage
            ? {
                covered: coverage.coveredRequirements,
                total: coverage.approvedRequirements,
              }
            : null,
          activity,
          activityUnavailable: [imports, plans, runs].some(
            (r) => r.status === 'rejected',
          ),
        }}
      />
    );
  } catch {
    return (
      <p role="alert">
        Unable to load project intelligence. Open the project areas to retry; no
        quality result is assumed.
      </p>
    );
  }
}
