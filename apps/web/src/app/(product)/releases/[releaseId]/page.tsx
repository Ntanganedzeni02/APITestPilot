import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canManageReleases, releaseLifecycle } from '@testpilot/domain';
import { releaseContext } from '../../../../lib/releases/context';
import { ReleaseActionForm } from '../../../../components/releases/action-form';
import { ReleaseAssessmentPanel } from '../../../../components/releases/assessment-panel';
export default async function ReleaseDetail({
  params,
  searchParams,
}: {
  params: Promise<{ releaseId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { releaseId } = await params;
  const page = Number((await searchParams).page ?? 0);
  let data;
  let c;
  let source;
  try {
    c = await releaseContext();
    if (!c) return <p>Select a project first.</p>;
    data = await c.repo.detail(c.workspace.id, c.project.id, releaseId, page);
    source = await c.repo.latestSource(c.workspace.id, c.project.id);
  } catch {
    return <p role="alert">Unable to load release intelligence.</p>;
  }
  if (!data) notFound();
  const { release, current, decision } = data;
  const manages = canManageReleases(c.workspace.role);
  return (
    <main className="space-y-5">
      <h1>{release.name}</h1>
      <p>
        {releaseLifecycle(release, decision)} | environment{' '}
        {c.environments.find((e) => e.id === release.environment_id)?.type ??
          release.environment_id}{' '}
        | API source {release.api_import_id}
      </p>
      {source !== release.api_import_id && (
        <p>
          Source changed. This release scope and its snapshots are historical;
          create a release for the current API source.
        </p>
      )}
      {manages && (
        <ReleaseActionForm
          environment={release.environment_id}
          release={release.id}
          mode="ASSESS"
        />
      )}
      {current ? (
        <ReleaseAssessmentPanel assessment={current} />
      ) : (
        <p>No assessment. Release confidence is unknown.</p>
      )}
      <section className="rounded border p-4">
        <h2>Human decision</h2>
        {decision ? (
          <>
            <p>
              {decision.decision} by {decision.actor_id} at{' '}
              {decision.decided_at}
              {decision.is_override ? ' | explicit risk override' : ''}
            </p>
            <p>
              {decision.rationale ||
                'No rationale supplied for CLEAR approval.'}
            </p>
            {decision.assessment_id !== release.assessment_id && (
              <p>
                This decision concerns an earlier assessment and does not decide
                the current assessment.
              </p>
            )}
          </>
        ) : (
          <p>No human decision recorded. A score is not approval.</p>
        )}
        {manages && current && (
          <ReleaseActionForm
            environment={release.environment_id}
            release={release.id}
            assessment={current.id}
            decision={release.decision_id}
            mode="DECIDE"
          />
        )}
      </section>
      {manages && current && (
        <ReleaseActionForm
          environment={release.environment_id}
          release={release.id}
          assessment={current.id}
          mode="REPORT"
        />
      )}
      <h2>Assessment history</h2>
      {data.assessments.map((a) => (
        <details key={a.id}>
          <summary>
            {a.assessed_at} | {a.result.status} | {a.id}
          </summary>
          <ReleaseAssessmentPanel assessment={a} />
          {manages && (
            <ReleaseActionForm
              environment={release.environment_id}
              release={release.id}
              assessment={a.id}
              mode="REPORT"
            />
          )}
        </details>
      ))}
      <h2>Append-only decision history</h2>
      <ul>
        {data.decisions.map((d) => (
          <li key={d.id}>
            Revision {d.revision}: {d.decision} | actor {d.actor_id} |{' '}
            {d.decided_at} | assessment {d.assessment_id} | {d.rationale}
          </li>
        ))}
      </ul>
      <h2>Immutable reports</h2>
      <ul>
        {data.reports.map((r) => (
          <li key={r.id}>
            <Link href={'/reports/' + r.id}>
              {r.generated_at} | {r.snapshot.assessment.result.status} |{' '}
              {r.snapshot.decision?.decision ?? 'No decision'}
            </Link>
          </li>
        ))}
      </ul>
      <nav>
        {page > 0 && <Link href={'?page=' + (page - 1)}>Previous history</Link>}{' '}
        {(data.assessments.length === 25 ||
          data.decisions.length === 25 ||
          data.reports.length === 25) && (
          <Link href={'?page=' + (page + 1)}>Next history</Link>
        )}
      </nav>
    </main>
  );
}
