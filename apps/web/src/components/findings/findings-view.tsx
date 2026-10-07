import Link from 'next/link';
import { findingSeverities, type Finding } from '@testpilot/domain';
import type { FindingDetail } from '@testpilot/database';
import { FindingActionForm } from './action-form';
import { executionFailureMessage } from '@testpilot/domain';
export function FindingsList({ findings }: { findings: Finding[] }) {
  return (
    <div className="space-y-4">
      {!findings.length && (
        <p>
          No findings yet. Derive evidence from completed runs. An empty list
          does not establish that an API is defect-free.
        </p>
      )}
      {findings.map((f) => (
        <article key={f.id} className="rounded border p-4">
          <h2>
            <Link href={'/findings/' + f.id}>{f.title}</Link>
          </h2>
          <p>
            {f.status} / {f.severity} severity / {f.confidence} confidence
          </p>
          <p>{f.summary}</p>
          <p>
            Operation:{' '}
            {f.operation
              ? f.operation.method + ' ' + f.operation.pointer
              : 'Unavailable'}
          </p>
          <p>
            {f.occurrence_count} evidence-backed occurrence(s); latest:{' '}
            {f.last_observed_at}
          </p>
          <p>
            Review:{' '}
            {f.status === 'CANDIDATE' ? 'Human decision required' : f.status};
            test case: {f.case_id}
          </p>
        </article>
      ))}
    </div>
  );
}
export function FindingDetailView({ detail }: { detail: FindingDetail }) {
  const { finding: f } = detail;
  return (
    <div className="min-w-0 space-y-5">
      <Link href="/findings">Back to findings</Link>
      <h1 className="page-title">{f.title}</h1>
      <p>
        {f.status} / {f.severity} severity / {f.confidence} confidence
      </p>
      <p>{f.summary}</p>
      <p>
        Deterministic classification: {f.rule}; source: {f.source}
      </p>
      <p>
        First observed: {f.first_observed_at}; latest: {f.last_observed_at};
        occurrences: {f.occurrence_count}
      </p>
      <p>
        Environment: {f.environment_id}; case: {f.case_id}
      </p>
      <section>
        <h2>Requirement and risk traceability</h2>
        {detail.traceability.length ? (
          detail.traceability.map((t) => (
            <p key={t.qa_item_id}>
              {t.qa_kind}: {t.qa_item_id}; plan: {t.plan_id}
            </p>
          ))
        ) : (
          <p>No requirement or risk reference is available for this case.</p>
        )}
      </section>
      {detail.occurrences.map((o) => {
        const p = detail.packages.find((p) => p.id === o.package_id),
          r = detail.runs.find((r) => r.id === p?.run_id);
        return (
          <section key={o.id} className="min-w-0 rounded border p-4">
            <h2>Evidence occurrence</h2>
            <p>
              Observed: {o.observed_at}; package: {p?.id}; integrity
              fingerprint: {p?.fingerprint}
            </p>
            <p>
              Run: <Link href={'/runs#run-' + p?.run_id}>{p?.run_id}</Link>;
              configuration: {p?.config_id}; plan: {p?.plan_id}; scenario:{' '}
              {p?.scenario_id}
            </p>
            <p>
              Operation: {r?.request?.method ?? 'Unavailable'}{' '}
              {r?.request?.operationPointer ?? 'Unknown'}
            </p>
            <p>
              Authorized request fingerprint: {r?.fingerprint ?? 'Unavailable'}
            </p>
            {detail.items
              .filter((i) => i.package_id === o.package_id)
              .map((i) => (
                <p key={i.id}>
                  {i.kind}
                  {i.assertion_index !== null ? ' #' + i.assertion_index : ''}
                </p>
              ))}
            <p>
              Outcome: {r?.result?.outcome}; sent:{' '}
              {String(r?.result?.sent ?? false)}; safety: {r?.decision}
            </p>
            {r?.result?.failure && (
              <p>{executionFailureMessage(r.result.failure)}</p>
            )}
            {r?.request && (
              <details>
                <summary>
                  Authorized request (existing safe representation)
                </summary>
                <pre className="max-w-full whitespace-pre-wrap break-all">
                  {JSON.stringify(r.request, null, 2)}
                </pre>
              </details>
            )}
            {r?.result && (
              <details>
                <summary>Redacted response and assertions</summary>
                <pre className="max-w-full whitespace-pre-wrap break-all">
                  {JSON.stringify(
                    {
                      response: r.result.response,
                      assertions: r.result.assertions,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            )}
          </section>
        );
      })}
      <section>
        <h2>Human review</h2>
        <p>
          Confirmation is a human decision. No AI interpretation is configured.
        </p>
        {f.status === 'CANDIDATE' ? (
          <FindingActionForm label="Record review decision">
            <input type="hidden" name="findingId" value={f.id} />
            <input type="hidden" name="revision" value={f.revision} />
            <label className="form-label">
              Decision
              <select
                name="mode"
                required
                className="form-input"
                defaultValue=""
              >
                <option value="" disabled>
                  Select a decision
                </option>
                <option value="CONFIRM">Confirm finding</option>
                <option value="DISMISS">Dismiss finding</option>
              </select>
            </label>
            <label className="form-label">
              Effective severity
              <select
                name="severity"
                defaultValue={f.severity}
                className="form-input"
              >
                {findingSeverities.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Review note (no credentials)
              <textarea name="note" maxLength={1000} className="form-input" />
            </label>
          </FindingActionForm>
        ) : (
          <p>
            This finding has been reviewed. Subsequent occurrences preserve that
            decision.
          </p>
        )}
        {detail.reviews.map((r) => (
          <article key={r.id}>
            <p>
              {r.decision} by {r.actor_id} at {r.created_at};{' '}
              {r.previous_status} / {r.new_status}; severity{' '}
              {r.previous_severity} / {r.new_severity}
            </p>
            <p>{r.note}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
