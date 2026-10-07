import Link from 'next/link';
import { createFindingRepository } from '@testpilot/database';
import { findingStatuses } from '@testpilot/domain';
import { requireUser } from '../../../lib/auth/server';
import { getTenantContext } from '../../../lib/tenancy/context';
import { FindingsList } from '../../../components/findings/findings-view';
export default async function Findings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project)
    return (
      <section>
        <h1 className="page-title">Findings</h1>
        <p>Select a project first.</p>
      </section>
    );
  try {
    const query = await searchParams,
      page = Number(query['page'] ?? 0),
      status =
        typeof query['status'] === 'string' && query['status']
          ? query['status']
          : undefined;
    const findings = await createFindingRepository(client).list(
      workspace.id,
      project.id,
      page,
      status,
    );
    return (
      <section className="space-y-4">
        <h1 className="page-title">Findings</h1>
        <p>Evidence supports candidates. Humans confirm or dismiss them.</p>
        <form>
          <label>
            Status
            <select name="status" defaultValue={status ?? ''}>
              <option value="">All</option>
              {findingStatuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button className="rounded border p-2">Filter</button>
        </form>
        <FindingsList findings={findings} />
        {page > 0 && (
          <Link
            href={'/findings?page=' + (page - 1) + '&status=' + (status ?? '')}
          >
            Previous
          </Link>
        )}
        {findings.length === 25 && (
          <Link
            href={'/findings?page=' + (page + 1) + '&status=' + (status ?? '')}
          >
            Next
          </Link>
        )}
      </section>
    );
  } catch {
    return (
      <section>
        <h1 className="page-title">Findings</h1>
        <p role="alert">
          Unable to load findings. Check permissions and migration availability,
          then try again.
        </p>
      </section>
    );
  }
}
