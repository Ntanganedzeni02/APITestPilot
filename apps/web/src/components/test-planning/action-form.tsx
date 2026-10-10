'use client';
import { useActionState, useRef, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { planningAction } from '../../lib/test-planning/actions';
export function PlanningActionForm({
  children,
  label,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(planningAction, {});
  const submitted = useRef(false);
  const router = useRouter();
  useEffect(() => {
    if (!state.saved || !state.planId || !state.analysisId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('analysis', state.analysisId);
    url.searchParams.set('plan', state.planId);
    router.replace(url.pathname + url.search);
  }, [state.saved, state.planId, state.analysisId, router]);
  useEffect(() => {
    if (!pending) submitted.current = false;
  }, [pending, state]);
  return (
    <form
      action={action}
      aria-busy={pending}
      onSubmit={(event) => {
        if (disabled || pending || submitted.current) event.preventDefault();
        else submitted.current = true;
      }}
      className="mt-3 space-y-3"
    >
      <fieldset disabled={pending || disabled} className="space-y-3">
        {children}
        <button
          disabled={pending || disabled}
          className="rounded border px-4 py-2"
        >
          {pending
            ? label.includes('AI')
              ? 'Generating AI suggestions...'
              : 'Saving...'
            : label}
        </button>
      </fieldset>
      {state.error && <p role="alert">{state.error}</p>}
      {state.saved && <p role="status">Saved successfully.</p>}
    </form>
  );
}
