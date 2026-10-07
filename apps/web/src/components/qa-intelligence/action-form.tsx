'use client';
import { useActionState, type ReactNode } from 'react';
import { qaAction } from '../../lib/qa-intelligence/actions';
export function QaActionForm({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const [state, action, pending] = useActionState(qaAction, {});
  return (
    <form action={action} className="mt-3 space-y-3">
      <fieldset disabled={pending} className="space-y-3">
        {children}
        <button
          className="rounded-md border border-border px-4 py-2 disabled:opacity-50"
          disabled={pending}
        >
          {pending ? 'Saving…' : label}
        </button>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className="text-sm">
          Saved successfully.
        </p>
      )}
    </form>
  );
}
