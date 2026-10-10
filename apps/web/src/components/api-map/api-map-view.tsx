'use client';
import {
  useEffect,
  useId,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { ApiImportSummary, GraphSnapshot } from '@testpilot/domain';
import { LocalTime, LocalDateOption } from '../ui/local-time';
import { KnowledgeView } from './knowledge-view';
import { SchemasView, TechnicalDetails } from './spec-details';
import { GraphView } from '../behaviour-graph/graph-view';
import type { ImportOption } from './presentation';
export const apiMapTabs = [
  ['endpoints', 'Endpoints'],
  ['graph', 'Behaviour Graph'],
  ['schemas', 'Schemas & Security'],
  ['imports', 'Imports'],
] as const;
export function importNavigation(current: string, importId: string) {
  const url = new URL(current, 'http://testpilot.invalid');
  url.searchParams.set('import', importId);
  url.searchParams.delete('endpoint');
  url.searchParams.delete('node');
  return url.pathname + url.search + url.hash;
}
export function ImportSelect({
  imports,
  selectedId,
}: {
  imports: ImportOption[];
  selectedId: string;
}) {
  const router = useRouter(),
    [pending, startTransition] = useTransition();
  return (
    <label className="form-label min-w-0">
      API import
      <select
        className="form-input max-w-full"
        value={selectedId}
        disabled={pending}
        aria-busy={pending}
        onChange={(e) => {
          const id = e.currentTarget.value;
          if (imports.some((i) => i.id === id))
            startTransition(() =>
              router.push(importNavigation(window.location.href, id)),
            );
        }}
      >
        {imports.map((i, index) => (
          <LocalDateOption
            key={i.id}
            value={i.id}
            timestamp={i.createdAt}
            prefix={`${i.title} | v${i.version}`}
            suffix={
              imports.filter(
                (other) =>
                  other.title === i.title && other.version === i.version,
              ).length > 1
                ? `History entry ${index + 1}`
                : ''
            }
          />
        ))}
      </select>
    </label>
  );
}
export function ApiMapView({
  imports,
  selected,
  snapshot,
  initialTab = 'endpoints',
  importForm,
  graphBuild,
  graphError,
}: {
  imports: ImportOption[];
  selected?: ApiImportSummary | undefined;
  snapshot?: GraphSnapshot | undefined;
  initialTab?: string;
  importForm: ReactNode;
  graphBuild?: ReactNode;
  graphError?: string | undefined;
}) {
  const normalize = (v: string) =>
    apiMapTabs.some(([id]) => id === v) ? v : 'endpoints';
  const [tab, setTab] = useState(normalize(initialTab));
  const id = useId();
  useEffect(() => {
    const update = () =>
      setTab(
        normalize(
          new URL(window.location.href).searchParams.get('view') ?? 'endpoints',
        ),
      );
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const selectTab = (value: string) => {
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set('view', value);
    if (selected) url.searchParams.set('import', selected.id);
    window.history.replaceState(window.history.state ?? null, '', url);
  };
  const k = selected?.knowledge;
  return (
    <section className="mt-5 min-w-0 space-y-5" aria-label="API exploration">
      {selected && k ? (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[1fr_minmax(240px,0.7fr)]">
            <header className="min-w-0">
              <h2 className="break-words text-2xl font-semibold">{k.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                API v{k.version} | OpenAPI {k.openapiVersion} | Imported{' '}
                <LocalTime value={selected.createdAt} />
              </p>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {k.description ?? 'No description declared.'}
              </p>
            </header>
            <ImportSelect imports={imports} selectedId={selected.id} />
          </div>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Declared endpoints', k.operations.length],
              ['Imported component schemas', k.schemaCount],
              ['Imported components', k.componentCount],
              [
                'Declared security schemes',
                Object.keys(k.securitySchemes ?? {}).length,
              ],
            ].map(([label, count]) => (
              <div
                key={label}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-xl font-semibold">{count}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <div className="rounded-lg border border-border p-5">
          <h2 className="font-semibold">No API specification imported</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Import a specification to explore its endpoints, schemas and
            security declarations.
          </p>
          <button
            type="button"
            onClick={() => selectTab('imports')}
            className="mt-3 text-sm underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Import API
          </button>
        </div>
      )}
      <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
        Specification knowledge only. Declarations and deterministic inferences
        are not verified execution evidence. Browsing this map makes no API
        requests.
      </p>
      <div
        role="tablist"
        aria-label="API Map sections"
        className="flex flex-wrap gap-1 border-b border-border pb-2"
      >
        {apiMapTabs.map(([value, label], index) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls={`${id}-${value}-panel`}
            id={`${id}-${value}-tab`}
            tabIndex={tab === value ? 0 : -1}
            key={value}
            onClick={() => selectTab(value)}
            onKeyDown={(e) => {
              const next =
                e.key === 'ArrowRight'
                  ? (index + 1) % apiMapTabs.length
                  : e.key === 'ArrowLeft'
                    ? (index + apiMapTabs.length - 1) % apiMapTabs.length
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? apiMapTabs.length - 1
                        : undefined;
              if (next !== undefined) {
                e.preventDefault();
                selectTab(apiMapTabs[next]![0]);
                const buttons =
                  e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  );
                buttons[next]?.focus();
              }
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${tab === value ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {apiMapTabs.map(([value]) => (
        <div
          key={value}
          role="tabpanel"
          id={`${id}-${value}-panel`}
          aria-labelledby={`${id}-${value}-tab`}
          tabIndex={0}
          hidden={tab !== value}
          className="min-w-0 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {value === 'endpoints' && k && (
            <KnowledgeView
              key={selected!.id}
              knowledge={k}
              snapshot={snapshot}
            />
          )}{' '}
          {value === 'schemas' && tab === value && k && (
            <SchemasView knowledge={k} />
          )}{' '}
          {value === 'graph' && tab === value && selected && (
            <div className="space-y-4">
              {graphError ? (
                <p role="alert">{graphError}</p>
              ) : (
                <>
                  {graphBuild}
                  {snapshot ? (
                    <GraphView key={snapshot.id} snapshot={snapshot} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No Behaviour Graph built for this import. Building is an
                      explicit action; the map never rebuilds automatically.
                    </p>
                  )}
                </>
              )}
            </div>
          )}{' '}
          {value === 'imports' && tab === value && (
            <section className="space-y-4" aria-label="Import history">
              <header>
                <h2 className="text-lg font-semibold">Import history</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Latest 50 imports. Every import preserves a distinct immutable
                  version.
                </p>
              </header>
              {imports.length ? (
                <ul className="space-y-2">
                  {imports.map((i, index) => (
                    <li
                      key={i.id}
                      className="rounded-lg border border-border p-3"
                    >
                      <a
                        href={importNavigation('/api-map?view=imports', i.id)}
                        aria-current={
                          i.id === selected?.id ? 'page' : undefined
                        }
                        className="block break-words text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {i.title} | v{i.version}{' '}
                        <span className="text-xs text-muted-foreground">
                          | History entry {index + 1}
                          {i.id === selected?.id ? ' | Active' : ''}
                        </span>
                      </a>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <LocalTime value={i.createdAt} /> | {i.operationCount}{' '}
                        endpoints
                      </p>
                      <TechnicalDetails
                        value={{
                          importId: i.id,
                          workspaceId: i.workspaceId,
                          projectId: i.projectId,
                          createdBy: i.createdBy,
                          createdAt: i.createdAt,
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm">No imports yet.</p>
              )}
              <details
                open={!imports.length}
                id="import-api"
                className="rounded-lg border border-border p-4"
              >
                <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-ring">
                  Import a new specification
                </summary>
                {importForm}
              </details>
            </section>
          )}
          {!k && value !== 'imports' && (
            <p className="text-sm text-muted-foreground">
              Import a specification first using the Imports tab.
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
