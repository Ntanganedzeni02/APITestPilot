'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LocalDateOption } from '../ui/local-time';
export function RequirementContextSelect({
  label,
  parameter,
  selectedId,
  options,
}: {
  label: string;
  parameter: 'analysis' | 'import';
  selectedId: string;
  options: { id: string; label: string; createdAt: string }[];
}) {
  const router = useRouter(),
    [pending, startTransition] = useTransition();
  return (
    <label className="form-label min-w-0">
      {label}
      <select
        value={selectedId}
        aria-busy={pending}
        disabled={pending}
        className="form-input"
        onChange={(e) => {
          const id = e.currentTarget.value;
          if (!options.some((o) => o.id === id)) return;
          const url = new URL(window.location.href);
          url.searchParams.set(parameter, id);
          if (parameter === 'analysis') url.searchParams.delete('import');
          startTransition(() => router.push(url.pathname + url.search));
        }}
      >
        {options.map((o) => (
          <LocalDateOption
            key={o.id}
            value={o.id}
            timestamp={o.createdAt}
            prefix={o.label}
          />
        ))}
      </select>
    </label>
  );
}
