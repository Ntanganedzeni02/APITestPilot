import { PageHeader } from '../ui/product';
import Link from 'next/link';
import {
  createApiKnowledgeRepository,
  createBehaviourGraphRepository,
  createQaRepository,
} from '@testpilot/database';
import { requireUser } from '../../lib/auth/server';
import { getTenantContext } from '../../lib/tenancy/context';
import { entityName } from '../../lib/display';
import { LocalTime } from '../ui/local-time';
import { TechnicalDetails } from '../api-map/spec-details';
import { RequirementContextSelect } from './context-select';
import { RequirementsView } from './requirements-view';
import { QaActionForm } from './action-form';
export async function RequirementsPage({
  query,
  kind = 'REQUIREMENT',
}: {
  kind?: 'REQUIREMENT' | 'RISK';
  query: Record<string, string | string[] | undefined>;
}) {
  const title = kind === 'RISK' ? 'Risks' : 'Requirements';
  const path = kind === 'RISK' ? '/risks' : '/requirements';
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project)
    return (
      <section>
        <PageHeader title={title} />
        <p className="mt-4">Select or create a project first.</p>
        <Link href="/projects/new" className="underline">
          Create project
        </Link>
      </section>
    );
  const unavailable = (message: string) => (
    <section>
      <PageHeader title={title} />
      <p role="alert" className="mt-4 text-sm">
        {message}
      </p>
      <Link href={path} className="mt-3 inline-block underline">
        Open available analyses
      </Link>
    </section>
  );
  try {
    const api = createApiKnowledgeRepository(client),
      graphs = createBehaviourGraphRepository(client);
    const [imports, analyses] = await Promise.all([
      api.list(workspace.id, project.id),
      createQaRepository(client).list(workspace.id, project.id),
    ]);
    for (const key of ['analysis', 'import'])
      if (
        query[key] !== undefined &&
        (typeof query[key] !== 'string' || !query[key])
      )
        return unavailable(
          'The selected analysis or import is unavailable. Choose an available project analysis.',
        );
    const analysis = query['analysis']
      ? analyses.find((a) => a.id === query['analysis'])
      : analyses[0];
    if (query['analysis'] && !analysis)
      return unavailable(
        'The selected analysis is unavailable in this project. Your selection has not been replaced.',
      );
    const sourceId =
      typeof query['import'] === 'string'
        ? query['import']
        : (analysis?.importId ?? imports[0]?.id);
    const source =
      imports.find((i) => i.id === sourceId) ??
      (sourceId
        ? (await api.list(workspace.id, project.id, sourceId))[0]
        : undefined);
    if (sourceId && !source)
      return unavailable(
        'The selected API import is unavailable in this project.',
      );
    const options =
      source && !imports.some((i) => i.id === source.id)
        ? [source, ...imports]
        : imports;
    const [latest, historical] = await Promise.all([
      source
        ? graphs.list(workspace.id, project.id, source.id)
        : Promise.resolve([]),
      analysis
        ? graphs.list(
            workspace.id,
            project.id,
            analysis.importId,
            analysis.graphId,
          )
        : Promise.resolve([]),
    ]);
    const snapshot = latest[0],
      graph = historical[0] ?? null;
    const titleFor = (id: string) =>
      options.find((i) => i.id === id)?.knowledge.title ?? 'Imported API';
    const analysisLabel = analysis
      ? entityName(titleFor(analysis.importId), 'Analysis', analysis.id)
      : undefined;
    return (
      <div className="min-w-0">
        <header className="grid items-start gap-4 lg:grid-cols-[1fr_minmax(280px,0.8fr)]">
          <div className="min-w-0">
            <PageHeader title={title} />
            <p className="mt-2 break-words text-sm font-medium">
              {analysisLabel ?? 'No analysis selected'}
            </p>
            {analysis && (
              <p className="mt-1 text-xs text-muted-foreground">
                Created <LocalTime value={analysis.createdAt} />
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Review specification-backed proposals. Approval supports planning;
              it never authorizes execution.
            </p>
          </div>
          {analyses.length > 0 && analysis && (
            <RequirementContextSelect
              label="Choose analysis (latest 10)"
              parameter="analysis"
              selectedId={analysis.id}
              options={analyses.map((a) => ({
                id: a.id,
                label: entityName(titleFor(a.importId), 'Analysis', a.id),
                createdAt: a.createdAt,
              }))}
            />
          )}
        </header>
        <details
          open={!analysis}
          className="mt-4 rounded-lg border border-border bg-surface p-4"
        >
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">
            Create an analysis
          </summary>
          <div className="mt-3 space-y-3">
            {source && (
              <RequirementContextSelect
                label="Specification to analyze"
                parameter="import"
                selectedId={source.id}
                options={options.map((i) => ({
                  id: i.id,
                  label: `${i.knowledge.title} | v${i.knowledge.version}`,
                  createdAt: i.createdAt,
                }))}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Creating an analysis preserves previous analyses and their
              reviews. Generation is an explicit action.
            </p>
            {source && snapshot ? (
              <>
                <p className="text-sm">
                  {source.knowledge.title} | Latest graph snapshot created{' '}
                  <LocalTime value={snapshot.createdAt} />
                </p>
                <QaActionForm
                  label="Create analysis"
                  successMessage="Analysis created. Choose the new entry from analysis history to review it."
                >
                  <input type="hidden" name="mode" value="ANALYZE" />
                  <input type="hidden" name="importId" value={source.id} />
                  <input type="hidden" name="graphId" value={snapshot.id} />
                </QaActionForm>
                <TechnicalDetails
                  value={{
                    importId: source.id,
                    graphId: snapshot.id,
                    builderVersion: snapshot.graph.builderVersion,
                  }}
                  label="Technical details: exact generation source"
                />
              </>
            ) : (
              <p className="text-sm">
                Import an API and build its Behaviour Graph first.{' '}
                <Link href="/api-map" className="underline">
                  Open API Map
                </Link>
              </p>
            )}
          </div>
        </details>
        {analysis ? (
          <RequirementsView
            key={analysis.id}
            kind={kind}
            analysis={analysis}
            graph={graph}
            role={workspace.role}
          />
        ) : (
          <p className="mt-5 rounded-lg border border-border p-4 text-sm">
            No {title.toLowerCase()} analysis yet. Create an analysis from an
            imported specification and its graph.
          </p>
        )}
      </div>
    );
  } catch {
    return unavailable(
      `${title} are unavailable. Please try again or contact your workspace administrator.`,
    );
  }
}
