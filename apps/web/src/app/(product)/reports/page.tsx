import {
  PageHeader,
  StatusBadge,
  EmptyState,
} from '../../../components/ui/product';
import { LocalTime } from '../../../components/ui/local-time';
import Link from 'next/link';
import { releaseContext } from '../../../lib/releases/context';
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  try {
    const c = await releaseContext();
    if (!c) return <p>Select a project first.</p>;
    const page = Number((await searchParams).page ?? 0),
      reports = await c.repo.reports(c.workspace.id, c.project.id, page);
    return (
      <main className="space-y-5">
        <PageHeader
          title="Release Reports"
          description="Immutable evidence snapshots, ready to inspect and share."
        />
        <p>
          Immutable evidence snapshots. Human decisions remain separate from
          TestPilot assessments.
        </p>
        {!reports.length ? (
          <EmptyState
            title="No reports on this page"
            description="Create and assess a release to preserve its evidence in an immutable report."
            href="/releases"
            action="Open Release Center"
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {reports.map((r) => (
              <li key={r.id} className="product-card">
                <Link href={'/reports/' + r.id} className="block">
                  <span className="font-semibold">
                    {r.snapshot.release.name}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge value={r.snapshot.assessment.result.status} />
                    <span className="text-xs text-muted-foreground">
                      {r.snapshot.environmentType} |{' '}
                      <LocalTime value={r.generated_at} />
                    </span>
                  </span>
                  <span className="mt-3 block text-xs text-muted-foreground">
                    Human decision:{' '}
                    {r.snapshot.decision?.decision ?? 'No decision'}. Quality:{' '}
                    {r.snapshot.assessment.result.inputs.quality?.result
                      .overall ?? 'Unknown'}
                    ; sufficiency:{' '}
                    {r.snapshot.assessment.result.inputs.quality?.result
                      .sufficiency ?? 'Unknown'}
                    .
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <nav>
          {page > 0 && <Link href={'?page=' + (page - 1)}>Previous</Link>}{' '}
          {reports.length === 25 && (
            <Link href={'?page=' + (page + 1)}>Next</Link>
          )}
        </nav>
      </main>
    );
  } catch {
    return (
      <p role="alert">
        Unable to load reports. Check project access and migration availability.
      </p>
    );
  }
}
