import Link from 'next/link';
import { releaseContext } from '../../lib/releases/context';
export async function ReleaseOverview() {
  try {
    const c = await releaseContext();
    if (!c) return null;
    const releases = await c.repo.list(c.workspace.id, c.project.id);
    const first = releases[0];
    if (!first)
      return (
        <section>
          <h2>Release Intelligence</h2>
          <p>No release created. No human release decision recorded.</p>
          <Link href="/releases">Open Release Center</Link>
        </section>
      );
    const d = await c.repo.detail(c.workspace.id, c.project.id, first.id);
    return (
      <section className="rounded border p-4">
        <h2>
          Latest release:{' '}
          <Link href={'/releases/' + first.id}>{first.name}</Link>
        </h2>
        <p>
          Environment{' '}
          {c.environments.find((e) => e.id === first.environment_id)?.type ??
            first.environment_id}{' '}
          | source {first.api_import_id}
        </p>
        <p>
          Recorded assessment: {d?.current?.result.status ?? 'Unknown'} |{' '}
          {d?.current?.result.blockers.length ?? 0} blockers |{' '}
          {d?.current?.result.warnings.length ?? 0} warnings | as of{' '}
          {d?.current?.assessed_at ?? 'Not assessed'}
        </p>
        <p>
          Human decision:{' '}
          {d?.decision?.assessment_id === first.assessment_id
            ? d?.decision?.decision
            : 'No decision for this assessment'}
        </p>
        <p>
          Evidence can change. Refresh in Release Center before deciding. Scores
          never approve a release.
        </p>
      </section>
    );
  } catch {
    return <p role="alert">Release intelligence unavailable.</p>;
  }
}
