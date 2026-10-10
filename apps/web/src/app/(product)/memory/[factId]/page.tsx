import { PageHeader, Disclosure } from '../../../../components/ui/product';
import { TechnicalDetails } from '../../../../components/api-map/spec-details';
import { entityName, readableStatus } from '../../../../lib/display';
import { LocalTime } from '../../../../components/ui/local-time';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { intelligenceContext } from '../../../../lib/memory-quality/context';
export default async function MemoryDetail({
  params,
  searchParams,
}: {
  params: Promise<{ factId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const c = await intelligenceContext();
  if (!c) return <p>Select a project first.</p>;
  const { factId } = await params,
    page = Number((await searchParams).page ?? 0);
  let data;
  try {
    data = await c.repo.detail(c.workspace.id, c.project.id, factId, page);
  } catch {
    return <p role="alert">Unable to load memory provenance.</p>;
  }
  if (!data) notFound();
  const { fact, observations } = data;
  return (
    <main className="space-y-4">
      <PageHeader
        title={readableStatus(fact.kind)}
        description="Evidence-backed learning with preserved observation history."
      />
      <p>
        {readableStatus(fact.currentness)} |{' '}
        {fact.operation_id
          ? entityName('API', 'Operation', fact.operation_id)
          : 'Operation unavailable'}
      </p>
      <Disclosure title="Source and environment provenance">
        {' '}
        <p>
          Environment:{' '}
          {c.environments.find((e) => e.id === fact.environment_id)?.type ??
            fact.environment_id}{' '}
          | Source: {fact.api_import_id} | Graph: {fact.graph_id} | Test case:{' '}
          {fact.case_id}
        </p>
      </Disclosure>
      <p>
        First: <LocalTime value={fact.first_observed_at} /> | Last:{' '}
        <LocalTime value={fact.last_observed_at} /> | Count:{' '}
        {fact.observation_count}
      </p>
      <h2>Supporting observations</h2>
      <ul>
        {observations.map((o) => (
          <li key={o.id} className="my-4 rounded border p-4">
            <p>
              {o.claim} | <LocalTime value={o.observed_at} />
            </p>
            <Link href={'/runs#run-' + o.run_id}>
              {entityName('Execution', 'Run', o.run_id)}
            </Link>
            <p>
              <Link href={'/memory/evidence/' + o.id}>
                Inspect evidence package
              </Link>{' '}
              | Typed references retained in technical details.
            </p>
            {o.finding_id && (
              <p>
                <Link href={'/findings/' + o.finding_id}>
                  {entityName('Evidence', 'Finding', o.finding_id)}
                </Link>{' '}
                |{' '}
                {o.review_id
                  ? 'Human review available in provenance.'
                  : 'No human review linked.'}
              </p>
            )}
            {o.investigation_id && (
              <Link href={'/investigations/' + o.investigation_id}>
                {entityName('Evidence', 'Investigation', o.investigation_id)}
              </Link>
            )}
            <TechnicalDetails
              value={o}
              label="Technical details: observation provenance"
            />
          </li>
        ))}
      </ul>
      <nav aria-label="Observation pagination">
        {page > 0 && <Link href={'?page=' + (page - 1)}>Previous </Link>}
        {observations.length === 25 && (
          <Link href={'?page=' + (page + 1)}>Next</Link>
        )}
      </nav>
      <Link href={'/memory?environment=' + fact.environment_id}>
        Back to memory
      </Link>
    </main>
  );
}
