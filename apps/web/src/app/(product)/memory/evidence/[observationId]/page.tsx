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
      <h1>Supporting evidence</h1>
      <p>
        Package {data.package.id} | Integrity fingerprint{' '}
        {data.package.fingerprint}
      </p>
      <p>
        Environment {data.package.environment_id} | Case {data.package.case_id}
      </p>
      <p>
        Observation {data.observation.claim} at {data.observation.observed_at}
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
            {item.kind} | {item.id} | Assertion index{' '}
            {item.assertion_index ?? 'Not applicable'}
          </li>
        ))}
      </ul>
      <h2>Assertion evaluations</h2>
      <ul>
        {data.result.assertions.map((a, i) => (
          <li key={i}>
            {a.kind}: {a.status}
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
