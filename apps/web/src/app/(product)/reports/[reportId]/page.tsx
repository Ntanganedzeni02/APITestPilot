import Link from 'next/link';
import { notFound } from 'next/navigation';
import { releaseContext } from '../../../../lib/releases/context';
import { ReleaseAssessmentPanel } from '../../../../components/releases/assessment-panel';
export default async function ReportDetail({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  let report;
  try {
    const c = await releaseContext();
    if (!c) return <p>Select a project first.</p>;
    report = await c.repo.report(
      c.workspace.id,
      c.project.id,
      (await params).reportId,
    );
  } catch {
    return <p role="alert">Unable to load report.</p>;
  }
  if (!report) notFound();
  const s = report.snapshot;
  return (
    <main className="space-y-5">
      <h1>Release report: {s.release.name}</h1>
      <p>
        {report.report_version} | generated {report.generated_at} by{' '}
        {report.generated_by}
      </p>
      <p>
        {s.environmentType} | project {s.release.project_id} | source{' '}
        {s.release.api_import_id}
      </p>
      <p>
        This report preserves its original assessment and decision. It is not
        recalculated from current state.
      </p>
      <Link href={'/releases/' + report.release_id}>Release</Link>{' '}
      <Link href={'/reports/' + report.id + '/export'}>Download JSON</Link>
      <ReleaseAssessmentPanel assessment={s.assessment} />
      <h2>Human decision at report generation</h2>
      {s.decision ? (
        <>
          <p>
            {s.decision.decision} | {s.decision.actor_id} |{' '}
            {s.decision.decided_at} |{' '}
            {s.decision.is_override ? 'Explicit override' : 'No override'}
          </p>
          <p>{s.decision.rationale}</p>
        </>
      ) : (
        <p>No human decision recorded in this snapshot.</p>
      )}
    </main>
  );
}
