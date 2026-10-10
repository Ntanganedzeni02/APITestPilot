'use client';
import { useActionState, type ReactNode } from 'react';
import {
  executionAction,
  type ExecutionActionState,
} from '../../lib/execution/actions';
export function ExecutionActionForm({
  children,
  label,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<
    ExecutionActionState,
    FormData
  >(executionAction, {});
  return (
    <form action={action} className="my-3 space-y-3">
      {children}
      <button
        disabled={pending || disabled}
        className="rounded border px-3 py-2 disabled:opacity-50"
      >
        {pending ? 'Saving...' : label}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.saved && (
        <p role="status">
          Action saved. This does not confirm HTTP execution; check run history
          for observed results.
        </p>
      )}
    </form>
  );
}
