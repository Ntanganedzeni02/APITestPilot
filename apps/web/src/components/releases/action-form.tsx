'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { releaseAction } from '../../lib/releases/actions';
export function ReleaseActionForm({
  environment,
  mode,
  release,
  assessment,
  decision,
}: {
  environment: string;
  mode: 'CREATE' | 'ASSESS' | 'DECIDE' | 'REPORT';
  release?: string;
  assessment?: string;
  decision?: string | null;
}) {
  const [state, action, pending] = useActionState(releaseAction, {});
  return (
    <form action={action} className="space-y-3 rounded border p-4">
      <input type="hidden" name="environmentId" value={environment} />
      <input type="hidden" name="mode" value={mode} />
      {release && <input type="hidden" name="releaseId" value={release} />}{' '}
      {assessment && (
        <input type="hidden" name="assessmentId" value={assessment} />
      )}
      {mode === 'CREATE' && (
        <label>
          Release name/version{' '}
          <input
            name="name"
            required
            maxLength={120}
            className="rounded border p-2"
          />
        </label>
      )}
      {mode === 'DECIDE' && (
        <>
          <input type="hidden" name="expectedDecision" value={decision ?? ''} />
          <label>
            Human decision{' '}
            <select name="decision" className="rounded border p-2">
              <option value="REJECT">Reject</option>
              <option value="APPROVE">Approve (CLEAR assessment only)</option>
              <option value="APPROVE_WITH_RISK">
                Approve with accepted risk
              </option>
            </select>
          </label>
          <label className="block">
            Rationale{' '}
            <textarea
              name="rationale"
              maxLength={1000}
              className="block w-full rounded border p-2"
            />
          </label>
          <p>
            Approval with risk and rejection require a rationale. Keep
            credentials and payloads out of notes.
          </p>
        </>
      )}
      <button disabled={pending} className="rounded border px-3 py-2">
        {pending
          ? 'Working...'
          : {
              CREATE: 'Create release',
              ASSESS: 'Assess release',
              DECIDE: 'Record human decision',
              REPORT: 'Generate immutable report',
            }[mode]}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && (
        <p role="status">
          {state.message}{' '}
          {state.href && <Link href={state.href}>Open result</Link>}
        </p>
      )}
    </form>
  );
}
