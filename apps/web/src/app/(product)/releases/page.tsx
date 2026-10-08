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
        <h1>Release Center</h1>
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
          {source ?? 'None'}
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
        {!releases.length ? (
          <p>No releases created. No release has been approved.</p>
        ) : (
          <ul>
            {releases.map((r) => (
              <li key={r.id}>
                <Link href={'/releases/' + r.id}>{r.name}</Link> | environment{' '}
                {c.environments.find((e) => e.id === r.environment_id)?.type ??
                  r.environment_id}{' '}
                | source {r.api_import_id} |{' '}
                {r.assessment_id ? 'Assessment available' : 'DRAFT'}
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
