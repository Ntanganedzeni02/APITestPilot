import { PageHeader } from '../../../components/ui/product';
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
import { ApiMapView } from '../../../components/api-map/api-map-view';
import { importOption } from '../../../components/api-map/presentation';
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
        <PageHeader
          title="API Map"
          description="Explore endpoints, contracts and recorded relationships."
        />
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
        <PageHeader
          title="API Map"
          description="Explore endpoints, contracts and recorded relationships."
        />
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
  if (
    query['import'] !== undefined &&
    (typeof query['import'] !== 'string' || !query['import'])
  )
    notFound();
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
      <PageHeader
        title="API Map"
        description="Explore endpoints, contracts and recorded relationships."
      />
      <p className="mt-3 break-words text-sm text-muted-foreground">
        {project.name}
      </p>
      <ApiMapView
        imports={imports.map(importOption)}
        selected={selected}
        snapshot={snapshot}
        initialTab={
          typeof query['view'] === 'string' ? query['view'] : 'endpoints'
        }
        importForm={<ImportForm />}
        graphBuild={
          selected ? (
            <GraphBuildForm importId={selected.id} rebuild={!!snapshot} />
          ) : undefined
        }
        graphError={graphError}
      />
    </div>
  );
}
