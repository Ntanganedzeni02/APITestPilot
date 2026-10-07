'use client';
import { useActionState, type ReactNode } from 'react';
import { planningAction } from '../../lib/test-planning/actions';
export function PlanningActionForm({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const [state, action, pending] = useActionState(planningAction, {});
  return (
    <form action={action} className="mt-3 space-y-3">
      <fieldset disabled={pending} className="space-y-3">
        {children}
        <button disabled={pending} className="rounded border px-4 py-2">
          {pending ? 'Saving...' : label}
        </button>
      </fieldset>
      {state.error && <p role="alert">{state.error}</p>}
      {state.saved && <p role="status">Saved successfully.</p>}
    </form>
  );
}
