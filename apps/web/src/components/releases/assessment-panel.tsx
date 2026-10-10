import Link from 'next/link';
import type { ReleaseAssessment } from '@testpilot/domain';
import { Card, Metric, StatusBadge, Disclosure, Progress } from '../ui/product';
import { LocalTime } from '../ui/local-time';
import { TechnicalDetails } from '../api-map/spec-details';
import { entityName, readableStatus } from '../../lib/display';
export function ReleaseAssessmentPanel({
  assessment,
}: {
  assessment: ReleaseAssessment;
}) {
  const r = assessment.result,
    q = r.inputs.quality;
  return (
    <Card title="Release assessment" action={<StatusBadge value={r.status} />}>
      <p className="text-sm text-muted-foreground">
        Descriptive evidence state. Humans decide; this assessment authorizes no
        release or execution.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Assessed <LocalTime value={assessment.assessed_at} />. The snapshot does
        not automatically refresh.
      </p>
      <dl className="my-4 grid grid-cols-3 gap-3">
        {(['blockers', 'warnings', 'unknowns'] as const).map((key) => (
          <Metric key={key} label={readableStatus(key)} value={r[key].length} />
        ))}
      </dl>
      <div className="space-y-3">
        {(['blockers', 'warnings', 'unknowns'] as const).map((key) => (
          <Disclosure
            key={key}
            title={`${readableStatus(key)} (${r[key].length})`}
          >
            {r[key].length ? (
              <ul className="space-y-2">
                {r[key].map((s, i) => (
                  <li key={i}>
                    <span>{readableStatus(s.code)}</span>
                    <TechnicalDetails
                      value={s}
                      label="Supporting references and policy code"
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                None identified by this policy.
              </p>
            )}
          </Disclosure>
        ))}
      </div>
      <div className="my-5 rounded-lg bg-muted p-4">
        <h3>API quality context</h3>
        {q ? (
          <>
            <p className="mt-2">
              {q.result.overall ?? 'Unknown'} / 100{' '}
              <StatusBadge value={q.result.status} />
            </p>
            <div className="mt-4">
              <Progress
                label="Evidence sufficiency"
                value={q.result.sufficiency}
                total={100}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {readableStatus(q.result.confidence)} confidence. Quality does not
              decide release approval.
            </p>
            <Link
              href={'/quality?environment=' + assessment.environment_id}
              className="button-link mt-3"
            >
              Inspect quality details
            </Link>
          </>
        ) : (
          <p>
            No compatible current quality assessment. Evidence is insufficient.
          </p>
        )}
      </div>
      <Disclosure title="Evidence and traceability">
        <div className="space-y-4">
          <h3>Execution and evidence</h3>
          <ul>
            {r.inputs.runs.map((run) => (
              <li key={run.runId}>
                <Link href={'/runs#run-' + run.runId}>
                  {entityName('Execution', 'Run', run.runId)}
                </Link>{' '}
                | {readableStatus(run.outcome)} | {readableStatus(run.ageBand)}
              </li>
            ))}
          </ul>
          <p>
            Infrastructure errors represent inability to verify; they do not
            confirm a product defect.
          </p>
          <h3>Requirement/risk evidence</h3>
          <ul>
            {r.inputs.coverage.map((c) => (
              <li key={c.id}>
                <Link href={c.kind === 'RISK' ? '/risks' : '/requirements'}>
                  {entityName(readableStatus(c.kind), 'Reference', c.id)}
                </Link>{' '}
                | {c.covered ? 'Asserted coverage (may fail)' : 'Uncovered'}
              </li>
            ))}
          </ul>
          <h3>Finding authority</h3>
          <ul>
            {r.inputs.findings.map((f) => (
              <li key={f.id}>
                <Link href={'/findings/' + f.id}>
                  {entityName('Evidence', 'Finding', f.id)}
                </Link>{' '}
                <StatusBadge value={f.status} /> | {f.occurrences} occurrences
              </li>
            ))}
          </ul>
          <h3>Investigations</h3>
          <ul>
            {r.inputs.investigations.map((i) => (
              <li key={i.id}>
                <Link href={'/investigations/' + i.id}>
                  {entityName('Evidence', 'Investigation', i.id)}
                </Link>{' '}
                <StatusBadge value={i.status} /> |{' '}
                {i.conclusion ?? 'Unresolved'}
              </li>
            ))}
          </ul>
          <h3>Scoped memory context</h3>
          <ul>
            {r.inputs.memory.map((m) => (
              <li key={m.id}>
                <Link href={'/memory/' + m.id}>{readableStatus(m.kind)}</Link>{' '}
                <StatusBadge value={m.currentness} /> | {m.count} observations
              </li>
            ))}
          </ul>
          <p>
            Historical memory does not override current evidence. No code-diff
            impact inference is performed.
          </p>
        </div>
      </Disclosure>
      <TechnicalDetails
        value={assessment}
        label="Technical details: complete immutable assessment and provenance"
      />
    </Card>
  );
}
