import Link from 'next/link';
import type { ReleaseAssessment } from '@testpilot/domain';
export function ReleaseAssessmentPanel({
  assessment,
}: {
  assessment: ReleaseAssessment;
}) {
  const r = assessment.result,
    q = r.inputs.quality;
  return (
    <section className="space-y-4 rounded border p-4">
      <h2>TestPilot assessment: {r.status}</h2>
      <p>
        Descriptive evidence state. Humans decide; this assessment authorizes no
        release or execution.
      </p>
      <p>
        Assessed {assessment.assessed_at} | {assessment.policy_version} | Source{' '}
        {assessment.api_import_id}
      </p>
      {(['blockers', 'warnings', 'unknowns'] as const).map((key) => (
        <section key={key}>
          <h3>
            {key} ({r[key].length})
          </h3>
          {!r[key].length ? (
            <p>None identified by this policy.</p>
          ) : (
            <ul>
              {r[key].map((s, i) => (
                <li key={i}>
                  {s.code.replaceAll('_', ' ')}
                  {s.ids.length > 0 && <span> | {s.ids.join(', ')}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {q ? (
        <>
          <h3>
            API Quality: {q.result.overall ?? 'Unknown'} | {q.result.status}
          </h3>
          <p>
            Sufficiency {q.result.sufficiency}% | {q.result.confidence}{' '}
            confidence | {q.scoring_version}
          </p>
          <p>
            Requirements {q.result.inputs.coveredRequirements}/
            {q.result.inputs.activeRequirements}; risk weight{' '}
            {q.result.inputs.coveredRiskWeight}/{q.result.inputs.riskWeight};
            recently asserted operations {q.result.inputs.testedOperations}/
            {q.result.inputs.knownOperations}
          </p>
          <ul>
            {Object.entries(q.result.dimensions).map(([key, d]) => (
              <li key={key}>
                {key}: {d.score === null ? 'Unknown' : d.score + '%'} |{' '}
                {d.numerator}/{d.denominator} | weight {d.weight}% | {d.basis}
              </li>
            ))}
          </ul>
          <p>
            Immutable quality snapshot {q.id}.{' '}
            <Link href={'/quality?environment=' + assessment.environment_id}>
              Current quality view
            </Link>
          </p>
        </>
      ) : (
        <p>
          No compatible current quality assessment. Evidence is insufficient.
        </p>
      )}
      <h3>Execution and evidence</h3>
      <ul>
        {r.inputs.runs.map((run) => (
          <li key={run.runId}>
            <Link href={'/runs#run-' + run.runId}>{run.runId}</Link>:{' '}
            {run.outcome} | {run.ageBand} | package {run.packageId}
          </li>
        ))}
      </ul>
      <p>
        Infrastructure errors represent inability to verify; they do not confirm
        a product defect.
      </p>
      <h3>Requirement/risk evidence</h3>
      <ul>
        {r.inputs.coverage.map((c) => (
          <li key={c.id}>
            <Link href={c.kind === 'RISK' ? '/risks' : '/requirements'}>
              {c.kind} {c.id}
            </Link>{' '}
            | {c.severity ?? 'Requirement'} |{' '}
            {c.covered ? 'Asserted coverage (may fail)' : 'Uncovered'} | failed
            runs {c.failedRunIds.join(', ') || 'None'} | review{' '}
            {c.reviewId ?? 'None'}
          </li>
        ))}
      </ul>
      <h3>Finding authority</h3>
      <ul>
        {r.inputs.findings.map((f) => (
          <li key={f.id}>
            <Link href={'/findings/' + f.id}>{f.id}</Link> | {f.status} |{' '}
            {f.severity} | {f.occurrences} occurrences | package {f.packageId} |
            reviews {f.reviewIds.join(', ') || 'None'}
          </li>
        ))}
      </ul>
      <h3>Investigations</h3>
      <ul>
        {r.inputs.investigations.map((i) => (
          <li key={i.id}>
            <Link href={'/investigations/' + i.id}>{i.id}</Link> | {i.status} |{' '}
            {i.conclusion ?? 'Unresolved'} | package {i.packageId} | conclusion
            evidence {i.conclusionPackageId ?? 'None'} | audit{' '}
            {i.auditIds?.join(', ') ?? 'None'}
          </li>
        ))}
      </ul>
      <h3>Scoped memory context</h3>
      <ul>
        {r.inputs.memory.map((m) => (
          <li key={m.id}>
            <Link href={'/memory/' + m.id}>{m.id}</Link> | {m.kind} |{' '}
            {m.currentness} | {m.count} observations | package {m.packageId} |
            observations {m.observationIds?.join(', ') ?? 'None'} | packages{' '}
            {m.packageIds?.join(', ') ?? 'None'}
          </li>
        ))}
      </ul>
      <p>
        Historical memory does not override current evidence. No code-diff
        impact inference is performed.
      </p>
    </section>
  );
}
