'use client';
import { useId, useState, type ReactNode } from 'react';
/** Count non-default categorical filters; search remains separate. */
export function activeFilterCount(
  filters: ReadonlyArray<{ value: string; defaultValue: string }>,
) {
  return filters.filter(({ value, defaultValue }) => value !== defaultValue)
    .length;
}
export function FiltersPanel({
  children,
  activeCount,
  onClear,
  label = 'Review filters',
}: {
  children: ReactNode;
  activeCount: number;
  onClear: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="min-w-0 space-y-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        className="rounded border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setOpen(!open)}
      >
        Filters{activeCount ? ` (${activeCount})` : ''}
      </button>
      <div
        id={id}
        hidden={!open}
        role="region"
        aria-label={label}
        className="rounded-lg border border-border bg-surface p-3"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {children}
        </div>
        <button
          type="button"
          className="mt-3 text-sm underline focus-visible:outline-2 focus-visible:outline-ring"
          onClick={onClear}
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
