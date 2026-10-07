import Link from 'next/link';
import { createInvestigationRepository } from '@testpilot/database';
import { investigationStatuses } from '@testpilot/domain';
import { requireUser } from '../../../lib/auth/server';
import { getTenantContext } from '../../../lib/tenancy/context';
import { InvestigationsList } from '../../../components/investigations/investigations-view';
export default async function Investigations({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project) return <p>Select a project first.</p>;
  try {
    const q = await searchParams,
      page = Number(q['page'] ?? 0),
      status =
        typeof q['status'] === 'string' && q['status']
          ? q['status']
          : undefined;
    const items = await createInvestigationRepository(client).list(
      workspace.id,
      project.id,
      page,
      status,
    );
    return (
      <section className="space-y-4">
        <h1 className="page-title">Investigations</h1>
        <p>Evidence-grounded follow-ups. Proposals do not authorize HTTP.</p>
        <form>
          <label>
            Status
            <select name="status" defaultValue={status ?? ''}>
              <option value="">All</option>
              {investigationStatuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button>Filter</button>
        </form>
        <InvestigationsList investigations={items} />
        {page > 0 && (
          <Link
            href={
              '/investigations?page=' + (page - 1) + '&status=' + (status ?? '')
            }
          >
            Previous
          </Link>
        )}
        {items.length === 25 && (
          <Link
            href={
              '/investigations?page=' + (page + 1) + '&status=' + (status ?? '')
            }
          >
            Next
          </Link>
        )}
      </section>
    );
  } catch {
    return (
      <p role="alert">
        Unable to load investigations. Check permissions and M1.9 migration
        availability.
      </p>
    );
  }
}
