import { PageHeader, Disclosure } from '../../../../../components/ui/product';
import { TechnicalDetails } from '../../../../../components/api-map/spec-details';
import { readableStatus } from '../../../../../lib/display';
import { LocalTime } from '../../../../../components/ui/local-time';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { intelligenceContext } from '../../../../../lib/memory-quality/context';
export default async function Evidence({
  params,
}: {
  params: Promise<{ observationId: string }>;
}) {
  const c = await intelligenceContext();
  if (!c) return <p>Select a project first.</p>;
  let data;
  try {
    data = await c.repo.provenance(
      c.workspace.id,
      c.project.id,
      (await params).observationId,
    );
  } catch {
    return <p role="alert">Unable to load evidence provenance.</p>;
  }
  if (!data) notFound();
  return (
    <main className="space-y-4">
      <PageHeader
        title="Supporting evidence"
        description="Recorded execution facts and assertion evaluations. No inference is treated as a confirmed defect."
      />
      <Disclosure title="Integrity and source provenance">
        {' '}
        <p>
          Package {data.package.id} | Integrity fingerprint{' '}
          {data.package.fingerprint}
        </p>
        <p>
          Environment {data.package.environment_id} | Case{' '}
          {data.package.case_id}
        </p>
      </Disclosure>
      <p>
        Observation {data.observation.claim} at{' '}
        <LocalTime value={data.observation.observed_at} />
      </p>
      <p>
        Persisted execution: {data.result.outcome} | Sent:{' '}
        {String(data.result.sent)} | Response status:{' '}
        {data.result.response?.status ?? 'Not observed'} | Execution error:{' '}
        {data.result.failure ?? 'None'}
      </p>
      <h2>Typed evidence references</h2>
      <ul>
        {data.items.map((item) => (
          <li key={item.id}>
            {readableStatus(item.kind)} | Assertion index{' '}
            {item.assertion_index ?? 'Not applicable'}
            <TechnicalDetails
              value={item}
              label="Technical details: typed evidence reference"
            />
          </li>
        ))}
      </ul>
      <h2>Assertion evaluations</h2>
      <ul>
        {data.result.assertions.map((a, i) => (
          <li key={i}>
            {readableStatus(a.kind)}: {readableStatus(a.status)}
          </li>
        ))}
      </ul>
      <Link href={'/runs#run-' + data.observation.run_id}>Open execution</Link>
      <p>
        <Link href={'/memory/' + data.observation.fact_id}>
          Back to memory fact
        </Link>
      </p>
      <p>
        This view references existing redacted evidence; it does not copy raw
        payloads into memory.
      </p>
    </main>
  );
}
