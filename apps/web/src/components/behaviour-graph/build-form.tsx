'use client';
import { useActionState } from 'react';
import { buildGraphAction } from '../../lib/behaviour-graph/actions';
export function GraphBuildForm({
  importId,
  rebuild = false,
}: {
  importId: string;
  rebuild?: boolean;
}) {
  const [state, action, pending] = useActionState(buildGraphAction, {});
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="importId" value={importId} />
      <button
        disabled={pending}
        className="rounded-md border border-border px-4 py-2 disabled:opacity-50"
      >
        {pending
          ? 'Building graph…'
          : rebuild
            ? 'Rebuild graph (new snapshot)'
            : 'Build Behaviour Graph'}
      </button>
      {state.error && (
        <p role="alert" className="mt-3 text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
