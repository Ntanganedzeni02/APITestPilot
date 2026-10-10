'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiltersPanel, activeFilterCount } from './filters-panel';
export interface QueryFilter {
  name: string;
  label: string;
  value: string;
  options?: { value: string; label: string }[];
}
export function QueryFilters({
  fields,
  environment,
  query,
}: {
  fields: QueryFilter[];
  environment: { id: string; options: { value: string; label: string }[] };
  query: Record<string, string | undefined>;
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.value])),
  );
  const [selectedEnvironment, setSelectedEnvironment] = useState(
    environment.id,
  );
  const router = useRouter();
  return (
    <form className="space-y-3">
      <label className="form-label max-w-xs">
        Environment
        <select
          name="environment"
          value={selectedEnvironment}
          onChange={(e) => setSelectedEnvironment(e.target.value)}
          className="form-input"
        >
          {environment.options.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      <FiltersPanel
        activeCount={activeFilterCount(
          fields.map((f) => ({
            value: values[f.name] ?? '',
            defaultValue: '',
          })),
        )}
        label="Memory filters"
        onClear={() => {
          setValues(Object.fromEntries(fields.map((f) => [f.name, ''])));
          const params = new URLSearchParams(
            Object.entries(query).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === 'string' &&
                !fields.some((f) => f.name === entry[0]) &&
                entry[0] !== 'page',
            ),
          );
          params.set('environment', selectedEnvironment);
          router.push(window.location.pathname + '?' + params.toString());
        }}
      >
        {fields.map((f) => (
          <label className="form-label" key={f.name}>
            {f.label}
            {f.options ? (
              <select
                className="form-input"
                name={f.name}
                value={values[f.name] ?? ''}
                onChange={(e) =>
                  setValues({ ...values, [f.name]: e.target.value })
                }
              >
                <option value="">All</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="form-input"
                name={f.name}
                maxLength={2000}
                value={values[f.name] ?? ''}
                onChange={(e) =>
                  setValues({ ...values, [f.name]: e.target.value })
                }
              />
            )}
          </label>
        ))}
        <button className="button-link">Apply filters</button>
      </FiltersPanel>
    </form>
  );
}
