import { PageHeader, Disclosure } from '../../../../components/ui/product';
import { TechnicalDetails } from '../../../../components/api-map/spec-details';
import { readableStatus } from '../../../../lib/display';
import { LocalTime } from '../../../../components/ui/local-time';
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
      <PageHeader
        title={s.release.name}
        eyebrow="Release report"
        description="An immutable snapshot of the assessment and human decision at generation time."
      />
      <Disclosure title="Report identity and recorded scope">
        {' '}
        <p>
          {report.report_version} | generated{' '}
          <LocalTime value={report.generated_at} /> by {report.generated_by}
        </p>
        <p>
          {s.environmentType} | project {s.release.project_id} | source{' '}
          {s.release.api_import_id}
        </p>
      </Disclosure>
      <p>
        This report preserves its original assessment and decision. It is not
        recalculated from current state.
      </p>
      <Link href={'/releases/' + report.release_id}>Release</Link>{' '}
      <Link className="button-link" href={'/reports/' + report.id + '/export'}>
        Download JSON
      </Link>
      <ReleaseAssessmentPanel assessment={s.assessment} />
      <h2>Human decision at report generation</h2>
      {s.decision ? (
        <>
          <p>
            {readableStatus(s.decision.decision)} |{' '}
            <LocalTime value={s.decision.decided_at} /> |{' '}
            {s.decision.is_override ? 'Explicit override' : 'No override'}
          </p>
          <p>{s.decision.rationale}</p>
          <TechnicalDetails
            value={s.decision}
            label="Technical details: human decision audit"
          />
        </>
      ) : (
        <p>No human decision recorded in this snapshot.</p>
      )}
    </main>
  );
}
