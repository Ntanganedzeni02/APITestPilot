import { TechnicalDetails } from '../../../components/api-map/spec-details';
import {
  PageHeader,
  StatusBadge,
  EmptyState,
} from '../../../components/ui/product';
import Link from 'next/link';
import { canManageReleases } from '@testpilot/domain';
import { releaseContext } from '../../../lib/releases/context';
import { ReleaseActionForm } from '../../../components/releases/action-form';
export default async function Releases({
  searchParams,
}: {
  searchParams: Promise<{ environment?: string; page?: string }>;
}) {
  const params = await searchParams;
  try {
    const c = await releaseContext(params.environment);
    if (!c) return <p>Select a project first.</p>;
    const page = Number(params.page ?? 0),
      releases = await c.repo.list(c.workspace.id, c.project.id, page),
      source = await c.repo.latestSource(c.workspace.id, c.project.id);
    return (
      <main className="space-y-5">
        <PageHeader
          title="Release Center"
          description="Understand readiness. Review evidence. Record a human decision."
        />
        <p>TestPilot assesses. Evidence supports. Humans decide.</p>
        <nav aria-label="Release environment">
          {c.environments.map((e) => (
            <Link className="mr-4" key={e.id} href={'?environment=' + e.id}>
              {e.type}
            </Link>
          ))}
        </nav>
        <p>
          New release scope: {c.environment.type} | current API import{' '}
          {source ? 'Available; exact scope retained below' : 'None'}
        </p>
        {source && canManageReleases(c.workspace.role) ? (
          <ReleaseActionForm environment={c.environment.id} mode="CREATE" />
        ) : (
          <p>
            {source
              ? 'Members can read; OWNER/ADMIN authority is required for release actions.'
              : 'Import an API before creating a release.'}
          </p>
        )}
        <TechnicalDetails
          value={{ sourceId: source, environmentId: c.environment.id }}
          label="Technical details: new release scope"
        />
        {!releases.length ? (
          <EmptyState
            title="No releases on this page"
            description="Create a release for an imported API, then assess the evidence before recording a human decision."
            href="/api-map"
            action="Inspect your API source"
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {releases.map((r) => (
              <li key={r.id} className="product-card">
                <Link href={'/releases/' + r.id} className="block">
                  <span className="font-semibold">{r.name}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span>
                      {c.environments.find((e) => e.id === r.environment_id)
                        ?.type ?? 'Historical environment'}
                    </span>
                    <StatusBadge
                      value={r.assessment_id ? 'ASSESSMENT_AVAILABLE' : 'DRAFT'}
                    />
                  </span>
                </Link>
                <TechnicalDetails
                  value={{
                    importId: r.api_import_id,
                    environmentId: r.environment_id,
                  }}
                  label="Technical details: immutable release scope"
                />
              </li>
            ))}
          </ul>
        )}
        <nav>
          {page > 0 && (
            <Link
              href={'?page=' + (page - 1) + '&environment=' + c.environment.id}
            >
              Previous
            </Link>
          )}{' '}
          {releases.length === 25 && (
            <Link
              href={'?page=' + (page + 1) + '&environment=' + c.environment.id}
            >
              Next
            </Link>
          )}
        </nav>
      </main>
    );
  } catch {
    return (
      <p role="alert">
        Unable to load releases. Check project access and migration
        availability.
      </p>
    );
  }
}
