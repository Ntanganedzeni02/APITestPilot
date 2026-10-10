import { PageHeader } from '../../../components/ui/product';
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
        <PageHeader
          title="Investigations"
          description="Follow evidence with bounded hypotheses and deliberate human review."
        />
        <p>Evidence-grounded follow-ups. Proposals do not authorize HTTP.</p>
        <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3">
          <label className="form-label">
            Status
            <select
              className="form-input"
              name="status"
              defaultValue={status ?? ''}
            >
              <option value="">All</option>
              {investigationStatuses.map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll('_', ' ').toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <button className="button-link">Apply status</button>
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
