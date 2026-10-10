'use client';
import { useActionState } from 'react';
import { intelligenceAction } from '../../lib/memory-quality/actions';
export function IntelligenceActionForm({
  environment,
  mode,
}: {
  environment: string;
  mode: 'MEMORY' | 'QUALITY';
}) {
  const [state, action, pending] = useActionState(intelligenceAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="environmentId" value={environment} />
      <input type="hidden" name="mode" value={mode} />
      <button disabled={pending} className="rounded border p-2">
        {pending
          ? 'Refreshing...'
          : mode === 'MEMORY'
            ? 'Refresh Memory'
            : 'Assess Quality'}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}
