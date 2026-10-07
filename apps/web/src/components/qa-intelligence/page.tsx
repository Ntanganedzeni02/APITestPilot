import Link from 'next/link';
import {
  createApiKnowledgeRepository,
  createBehaviourGraphRepository,
  createQaRepository,
} from '@testpilot/database';
import type { QaKind } from '@testpilot/domain';
import { requireUser } from '../../lib/auth/server';
import { getTenantContext } from '../../lib/tenancy/context';
import { QaActionForm } from './action-form';
import { IntelligenceView } from './intelligence-view';
export async function IntelligencePage({
  kind,
  query,
}: {
  kind: QaKind;
  query: Record<string, string | string[] | undefined>;
}) {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  const title = kind === 'REQUIREMENT' ? 'Requirements' : 'Risks';
  if (!workspace || !project)
    return (
      <section>
        <h1 className="page-title">{title}</h1>
        <p className="mt-4">Select or create a project first.</p>
        <Link href="/projects/new">Create project</Link>
      </section>
    );
  try {
    const imports = await createApiKnowledgeRepository(client).list(
      workspace.id,
      project.id,
    );
    const source = imports.find((i) => i.id === query['import']) ?? imports[0];
    const snapshots = source
      ? await createBehaviourGraphRepository(client).list(
          workspace.id,
          project.id,
          source.id,
        )
      : [];
    const snapshot = snapshots[0];
    const analyses = await createQaRepository(client).list(
      workspace.id,
      project.id,
    );
    const analysis =
      analyses.find((a) => a.id === query['analysis']) ?? analyses[0];
    const historical = analysis
      ? ((
          await createBehaviourGraphRepository(client).list(
            workspace.id,
            project.id,
            analysis.importId,
            analysis.graphId,
          )
        )[0] ?? null)
      : null;
    return (
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        <p className="mt-3 text-sm">
          Specification-backed proposals and review-worthy risk signals. Human
          approval is required; no tests have been generated or executed.
        </p>
        {!!imports.length && (
          <form method="get" className="mt-4">
            <label className="form-label">
              Analysis source import
              <select
                name="import"
                defaultValue={source?.id}
                className="form-input"
              >
                {imports.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.knowledge.title} · {i.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <button className="mt-3 rounded border px-4 py-2">
              Select source
            </button>
          </form>
        )}
        {snapshot && source ? (
          <section className="mt-5 rounded border border-border p-4">
            <p className="break-all text-xs">
              Analyze exact import {source.id} and graph {snapshot.id} · builder{' '}
              {snapshot.graph.builderVersion}
            </p>
            <QaActionForm label="Analyze API">
              <input type="hidden" name="mode" value="ANALYZE" />
              <input type="hidden" name="importId" value={source.id} />
              <input type="hidden" name="graphId" value={snapshot.id} />
            </QaActionForm>
          </section>
        ) : (
          <p className="mt-6">
            Import an API and build its Behaviour Graph before analysis.{' '}
            <Link href="/api-map" className="underline">
              Open API Map
            </Link>
          </p>
        )}
        {!analysis ? (
          <p className="mt-6">
            No analysis yet. Requirements and risks will appear after Analyze
            API.
          </p>
        ) : (
          <>
            <form method="get" className="mt-4">
              <label className="form-label">
                Analysis history (latest 10)
                <select
                  name="analysis"
                  defaultValue={analysis.id}
                  className="form-input"
                >
                  {analyses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.createdAt} · {a.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="mt-3 rounded border px-4 py-2">
                View analysis
              </button>
            </form>
            <IntelligenceView
              key={`${analysis.id}:${kind}`}
              analysis={analysis}
              graph={historical}
              kind={kind}
              role={workspace.role}
            />
          </>
        )}
      </div>
    );
  } catch {
    return (
      <section>
        <h1 className="page-title">{title}</h1>
        <p role="alert" className="mt-5">
          QA intelligence is unavailable. Please try again or contact your
          workspace administrator.
        </p>
      </section>
    );
  }
}
