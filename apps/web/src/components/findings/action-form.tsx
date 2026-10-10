'use client';
import { useActionState, type ReactNode } from 'react';
import {
  findingAction,
  type FindingActionState,
} from '../../lib/findings/actions';
export function FindingActionForm({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const [state, action, pending] = useActionState<FindingActionState, FormData>(
    findingAction,
    {},
  );
  return (
    <form action={action} className="my-3 space-y-3">
      {children}
      <button
        disabled={pending}
        className="rounded border px-3 py-2 disabled:opacity-50"
      >
        {pending ? 'Saving...' : label}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.saved && <p role="status">Saved.</p>}
    </form>
  );
}
