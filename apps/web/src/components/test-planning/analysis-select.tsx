'use client';
import { LocalDateOption } from '../ui/local-time';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
export function AnalysisSelect({
  selectedId,
  options,
}: {
  selectedId: string | undefined;
  options: { id: string; label: string; createdAt?: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="form-label">
      Analysis
      <select
        key={selectedId ?? 'none'}
        aria-label="Analysis"
        disabled={pending}
        defaultValue={selectedId ?? ''}
        className="form-input w-full min-w-0 truncate focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => {
          const id = event.currentTarget.value;
          if (options.some((option) => option.id === id))
            startTransition(() =>
              router.push(`/tests?analysis=${encodeURIComponent(id)}`),
            );
        }}
      >
        {!selectedId && (
          <option value="" disabled>
            Select an analysis
          </option>
        )}
        {options.map((option) =>
          option.createdAt ? (
            <LocalDateOption
              key={option.id}
              value={option.id}
              timestamp={option.createdAt}
              prefix={option.label}
            />
          ) : (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ),
        )}
      </select>
      {pending && <span role="status">Loading analysis...</span>}
    </label>
  );
}
