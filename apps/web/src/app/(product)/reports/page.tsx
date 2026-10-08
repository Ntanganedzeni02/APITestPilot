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
        <h1>Release Reports</h1>
        <p>
          Immutable evidence snapshots. Human decisions remain separate from
          TestPilot assessments.
        </p>
        {!reports.length ? (
          <p>No reports generated. Create and assess a release first.</p>
        ) : (
          <ul>
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={'/reports/' + r.id}>{r.snapshot.release.name}</Link>{' '}
                | {r.snapshot.environmentType} | generated {r.generated_at} |{' '}
                {r.snapshot.assessment.result.status} | human:{' '}
                {r.snapshot.decision?.decision ?? 'No decision'} | quality{' '}
                {r.snapshot.assessment.result.inputs.quality?.result.overall ??
                  'Unknown'}{' '}
                | sufficiency{' '}
                {r.snapshot.assessment.result.inputs.quality?.result
                  .sufficiency ?? 'Unknown'}
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
