import Link from 'next/link';
import { qualityTrend, type QualityAssessment } from '@testpilot/domain';
export function QualityPanel({
  current,
  previous,
  latestSource,
}: {
  current: QualityAssessment | null;
  previous: QualityAssessment | null;
  latestSource?: string | undefined;
}) {
  if (!current)
    return (
      <section>
        <h2>API Quality Score</h2>
        <p>
          Unknown - no assessment. Import an API and assess persisted evidence.
          Missing evidence never means passing.
        </p>
      </section>
    );
  const result = current.result,
    trend = qualityTrend(current, previous);
  const historical = current.api_import_id !== (latestSource ?? null);
  return (
    <section className="space-y-4 rounded border p-5">
      <h2>API Quality Score: {result.overall ?? 'Unknown'}</h2>
      <p>
        {result.status} | Evidence sufficiency {result.sufficiency}% |{' '}
        {result.confidence} confidence
      </p>
      {historical && (
        <p role="status">
          Historical source assessment. The current API version is unverified
          until reassessed.
        </p>
      )}
      <p>
        Assessed {current.assessed_at} | {current.scoring_version} | Environment{' '}
        {current.environment_id}
      </p>
      <p>
        Snapshot reflects evidence at assessment time. Refresh to evaluate new
        results, reviews or aging evidence.
      </p>
      <p>
        Known operations: {result.inputs.knownOperations}. Recently asserted:{' '}
        {result.inputs.testedOperations}. Unverified or stale:{' '}
        {result.inputs.gaps.operations.length}.
      </p>
      <dl>
        {Object.entries(result.dimensions).map(([key, d]) => (
          <div key={key} className="my-3">
            <dt className="font-semibold">
              {key}: {d.score ?? 'Unknown'} | weight {d.weight}%
            </dt>
            <dd>
              {d.numerator} / {d.denominator}. {d.basis}
            </dd>
            <dd>Change: {trend.dimensions[key] ?? 'Not comparable'}</dd>
          </div>
        ))}
      </dl>
      <p>
        Overall change: {trend.overall ?? 'Not comparable'} | Sufficiency
        change: {trend.sufficiency ?? 'Not comparable'} | {trend.reason}
      </p>
      <p>
        Descriptive evidence intelligence. Human release authority remains
        unchanged.
      </p>
      <Link href={'/quality?environment=' + current.environment_id}>
        Inspect quality gaps, provenance and history
      </Link>
    </section>
  );
}
