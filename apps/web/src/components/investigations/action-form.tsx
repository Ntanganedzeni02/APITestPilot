'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import {
  investigationAction,
  type InvestigationActionState,
} from '../../lib/investigations/actions';
export function InvestigationActionForm({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const [state, action, pending] = useActionState<
    InvestigationActionState,
    FormData
  >(investigationAction, {});
  return (
    <form action={action} className="space-y-2">
      {children}
      <button disabled={pending} className="rounded border p-2">
        {pending
          ? label.includes('AI')
            ? 'Generating AI suggestions...'
            : 'Saving...'
          : label}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.saved && (
        <p role="status">
          Saved.{' '}
          {state.investigationId && (
            <Link href={'/investigations/' + state.investigationId}>
              Open investigation
            </Link>
          )}
        </p>
      )}
    </form>
  );
}
