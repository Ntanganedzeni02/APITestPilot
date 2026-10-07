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
      <h1>{fact.kind}</h1>
      <p>
        {fact.currentness} | {fact.operation_id ?? 'Operation unavailable'}
      </p>
      <p>
        Environment:{' '}
        {c.environments.find((e) => e.id === fact.environment_id)?.type ??
          fact.environment_id}{' '}
        ? Source: {fact.api_import_id} | Graph: {fact.graph_id} | Test case:{' '}
        {fact.case_id}
      </p>
      <p>
        First: {fact.first_observed_at} | Last: {fact.last_observed_at} | Count:{' '}
        {fact.observation_count}
      </p>
      <h2>Supporting observations</h2>
      <ul>
        {observations.map((o) => (
          <li key={o.id} className="my-4 rounded border p-4">
            <p>
              {o.claim} | {o.observed_at}
            </p>
            <Link href={'/runs#run-' + o.run_id}>Execution {o.run_id}</Link>
            <p>
              <Link href={'/memory/evidence/' + o.id}>
                Evidence package {o.package_id}
              </Link>{' '}
              ? Item {o.evidence_item_id ?? 'Package-level provenance'}
            </p>
            {o.finding_id && (
              <p>
                <Link href={'/findings/' + o.finding_id}>
                  Finding {o.finding_id}
                </Link>{' '}
                ? Human review {o.review_id ?? 'None'}
              </p>
            )}
            {o.investigation_id && (
              <Link href={'/investigations/' + o.investigation_id}>
                Investigation {o.investigation_id}
              </Link>
            )}
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
