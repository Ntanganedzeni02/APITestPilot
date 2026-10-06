import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  createApiKnowledgeRepository,
  createBehaviourGraphRepository,
  PersistenceError,
} from '@testpilot/database';
import { requireUser } from '../../../lib/auth/server';
import { getTenantContext } from '../../../lib/tenancy/context';
import { ImportForm } from '../../../components/api-map/import-form';
import { KnowledgeView } from '../../../components/api-map/knowledge-view';
import { GraphView } from '../../../components/behaviour-graph/graph-view';
import { GraphBuildForm } from '../../../components/behaviour-graph/build-form';

export const metadata = { title: 'API Map' };
export default async function ApiMap({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project)
    return (
      <section>
        <h1 className="page-title">API Map</h1>
        <p className="mt-4">
          Select or create a project to import an API specification.
        </p>
        <Link href="/projects/new" className="mt-4 inline-block underline">
          Create project
        </Link>
      </section>
    );
  const query = await searchParams;
  let imports;
  try {
    imports = await createApiKnowledgeRepository(client).list(
      workspace.id,
      project.id,
    );
  } catch (error) {
    return (
      <section>
        <h1 className="page-title">API Map</h1>
        <p role="alert" className="mt-4">
          {error instanceof PersistenceError
            ? error.message
            : 'API knowledge is unavailable. Please try again.'}
        </p>
        <p className="mt-3 text-sm">
          Try again or contact your workspace administrator if the problem
          persists.
        </p>
      </section>
    );
  }
  const selectedId =
    typeof query['import'] === 'string' ? query['import'] : undefined;
  const selected = selectedId
    ? imports.find((i) => i.id === selectedId)
    : imports[0];
  if (selectedId && !selected) notFound();
  let snapshot;
  let graphError: string | undefined;
  if (selected) {
    try {
      snapshot = (
        await createBehaviourGraphRepository(client).list(
          workspace.id,
          project.id,
          selected.id,
        )
      )[0];
    } catch {
      graphError =
        'Behaviour Graph is unavailable. Please try again or contact your workspace administrator.';
    }
  }
  return (
    <div className="min-w-0">
      <p className="eyebrow">Project knowledge</p>
      <h1 className="page-title">API Map</h1>
      <p className="mt-3 break-words text-sm text-muted-foreground">
        {project.name}
      </p>
      {!imports.length && (
        <section className="mt-8 rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold">
            No API specification imported
          </h2>
          <p className="mt-2 text-sm">
            Import a specification to explore its endpoints, schemas and
            security declarations.
          </p>
          <a href="#import-api" className="mt-4 inline-block underline">
            Import API
          </a>
        </section>
      )}
      <details
        id="import-api"
        open={!imports.length}
        className="mt-6 rounded-lg border border-border p-5"
      >
        <summary className="cursor-pointer font-semibold">
          Import API specification
        </summary>
        <ImportForm />
      </details>
      {!!imports.length && (
        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="form-label min-w-0 flex-1">
            Import history (latest 50)
            <select
              name="import"
              defaultValue={selected?.id}
              className="form-input"
            >
              {imports.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.knowledge.title} · {i.knowledge.version} · {i.createdAt} ·{' '}
                  {i.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md border border-border px-4 py-2"
          >
            View import
          </button>
        </form>
      )}
      {selected && (
        <>
          <p className="mt-4 break-all text-xs text-muted-foreground">
            Import {selected.id} · {selected.createdAt}
          </p>
          <KnowledgeView knowledge={selected.knowledge} />
          {graphError ? (
            <p role="alert" className="mt-6 text-sm">
              {graphError}
            </p>
          ) : (
            <>
              {!snapshot && (
                <p className="mt-8 text-sm">
                  No Behaviour Graph built for this import.
                </p>
              )}
              <GraphBuildForm importId={selected.id} rebuild={!!snapshot} />
              {snapshot && <GraphView snapshot={snapshot} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
