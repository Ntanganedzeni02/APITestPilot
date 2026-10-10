'use client';
import { useMemo, useState } from 'react';
import type {
  ApiKnowledge,
  ApiOperation,
  GraphSnapshot,
} from '@testpilot/domain';
import {
  filterEndpoints,
  endpointGroups,
  securityLabel,
  constraints,
  relatedFacts,
} from './presentation';
import {
  ContentTable,
  DataTable,
  SchemaReference,
  SecurityRequirements,
  ServerDeclarations,
  TechnicalDetails,
} from './spec-details';
import { relationshipLabel, FactReason } from '../behaviour-graph/graph-view';

export function EndpointDetails({
  operation: op,
  knowledge: k,
  snapshot,
}: {
  operation: ApiOperation;
  knowledge: ApiKnowledge;
  snapshot?: GraphSnapshot | undefined;
}) {
  const facts = relatedFacts(snapshot?.graph, op);
  const nodes = new Map(snapshot?.graph.nodes.map((n) => [n.id, n]) ?? []);
  const inputsAndOutputs = new Set(
    facts.edges.filter((e) => e.from === facts.node?.id).map((e) => e.to),
  );
  const linkedSchemas = [
    ...new Set(
      snapshot?.graph.edges
        .filter(
          (e) =>
            inputsAndOutputs.has(e.from) &&
            [
              'REQUEST_USES_SCHEMA',
              'RESPONSE_USES_SCHEMA',
              'PARAMETER_USES_SCHEMA',
            ].includes(e.type),
        )
        .map((e) => nodes.get(e.to)?.label)
        .filter((label): label is string => !!label) ?? [],
    ),
  ];

  return (
    <article
      className="min-w-0 space-y-4 rounded-lg border border-border bg-surface p-4"
      aria-label="Selected endpoint"
    >
      <header>
        <p className="break-words font-mono font-semibold [overflow-wrap:anywhere]">
          {op.method} {op.path}
        </p>
        <h2 className="mt-1 text-lg font-semibold">
          {op.summary ?? 'No summary declared'}
        </h2>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">
          {op.description ?? 'No description declared.'}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {op.tags.join(' / ') || 'Untagged'}
          {op.deprecated ? ' | Deprecated' : ''}
        </p>
      </header>
      <section>
        <h3 className="mb-2 font-semibold">Parameters</h3>
        {op.parameters.length ? (
          <DataTable
            headers={[
              'Name',
              'Location',
              'Type / media type',
              'Required',
              'Constraints',
            ]}
            rows={op.parameters.map((p) => [
              <span key={p.name}>
                {p.name}
                {p.description && (
                  <span className="block text-xs text-muted-foreground">
                    {p.description}
                  </span>
                )}
              </span>,
              p.location,
              <div key={p.name}>
                <SchemaReference schema={p.schema} knowledge={k} />
                {p.content && (
                  <ContentTable content={p.content} knowledge={k} />
                )}
              </div>,
              p.required ? 'Yes' : 'No',
              constraints(p.schema),
            ])}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No parameters declared.
          </p>
        )}
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Request body</h3>
        {op.requestBody ? (
          <>
            <p className="mb-2 text-sm">
              {op.requestBody.required ? 'Required' : 'Optional'} |{' '}
              {op.requestBody.description ?? 'No description declared'}
            </p>
            <ContentTable content={op.requestBody.content} knowledge={k} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No request body declared.
          </p>
        )}
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Responses</h3>
        {op.responses.length ? (
          op.responses.map((r) => (
            <div
              key={r.status}
              className="mb-3 rounded border border-border p-3"
            >
              <p className="mb-2 text-sm">
                <strong>{r.status}</strong> |{' '}
                {r.description || 'No description declared'}
              </p>
              <ContentTable content={r.content} knowledge={k} />
              {Object.keys(r.headers ?? {}).length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs">
                    Declared response headers
                  </summary>
                  <TechnicalDetails value={r.headers} />
                </details>
              )}
            </div>
          ))
        ) : (
          <p>No responses declared.</p>
        )}
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Security requirements</h3>
        <SecurityRequirements value={op.security} />
      </section>
      <section>
        <h3 className="mb-2 font-semibold">
          Linked schemas and graph relationships
        </h3>
        <p className="mb-2 text-sm text-muted-foreground">
          Referenced schema nodes:{' '}
          {linkedSchemas.join(', ') || 'None linked in the stored graph'}. These
          are specification references, not runtime evidence.
        </p>
        {facts.edges.length ? (
          <ul className="space-y-2">
            {facts.edges.map((e) => (
              <li
                className="rounded border border-border p-3 text-sm"
                key={e.id}
              >
                <p>
                  {nodes.get(e.from)?.label}{' '}
                  <span className="text-muted-foreground">
                    {relationshipLabel(e.type)}
                  </span>{' '}
                  {nodes.get(e.to)?.label}
                </p>
                <FactReason fact={e} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {snapshot
              ? 'No stored graph relationships for this operation.'
              : 'Build a Behaviour Graph explicitly to explore stored relationships.'}
          </p>
        )}
      </section>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Declared endpoint servers
        </summary>
        <div className="mt-2">
          <ServerDeclarations value={op.servers} />
        </div>
      </details>
      <TechnicalDetails
        value={{
          operation: op,
          graphNode: facts.node,
          graphRelationships: facts.edges,
        }}
      />
    </article>
  );
}
export function KnowledgeView({
  knowledge: k,
  snapshot,
}: {
  knowledge: ApiKnowledge;
  snapshot?: GraphSnapshot | undefined;
}) {
  const [search, setSearch] = useState(''),
    [method, setMethod] = useState('ALL'),
    [grouping, setGrouping] = useState('tag'),
    [selectedKey, setSelectedKey] = useState<string | undefined>(
      k.operations[0]?.key,
    ),
    [limit, setLimit] = useState(100);
  const filtered = useMemo(
    () => filterEndpoints(k.operations, search, method),
    [k.operations, search, method],
  );
  const groups = useMemo(
    () => endpointGroups(filtered.slice(0, limit), grouping, snapshot?.graph),
    [filtered, limit, grouping, snapshot],
  );
  const selected =
    k.operations.find((op) => op.key === selectedKey) ??
    filtered[0] ??
    k.operations[0];
  return (
    <section className="min-w-0 space-y-4" aria-label="Endpoint explorer">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="form-label">
          Search endpoints
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(100);
            }}
            className="form-input"
            placeholder="Method, path, summary or tag"
          />
        </label>
        <label className="form-label">
          HTTP method
          <select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setLimit(100);
            }}
            className="form-input"
          >
            <option value="ALL">All methods</option>
            {[...new Set(k.operations.map((op) => op.method))].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="form-label">
          Group by
          <select
            className="form-input"
            value={grouping}
            onChange={(e) => setGrouping(e.target.value)}
          >
            <option value="tag">Tag</option>
            <option value="resource">Inferred resource</option>
            <option value="none">No grouping</option>
          </select>
        </label>
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {filtered.length} of {k.operations.length} endpoints
        {grouping === 'tag'
          ? ' | An endpoint may appear under multiple declared tags.'
          : grouping === 'resource'
            ? ' | Resource grouping is deterministic inference, not verified behavior.'
            : ''}
      </p>
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 space-y-4">
          {groups.map(([label, ops]) => (
            <section key={label}>
              <h2 className="mb-2 break-words text-xs font-semibold text-muted-foreground">
                {label}
              </h2>
              <ul className="space-y-2">
                {ops.map((op) => (
                  <li key={op.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(op.key)}
                      aria-pressed={selected?.key === op.key}
                      className={`w-full rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-ring ${selected?.key === op.key ? 'border-primary bg-primary/10' : 'border-border bg-surface'}`}
                    >
                      <span className="flex min-w-0 items-start gap-2">
                        <span className="rounded bg-muted px-2 py-1 text-xs font-bold text-information">
                          {op.method}
                        </span>
                        <span className="break-words font-mono text-sm [overflow-wrap:anywhere]">
                          {op.path}
                        </span>
                      </span>
                      <span className="mt-2 block break-words text-sm">
                        {op.summary ?? 'No summary declared'}
                      </span>
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {securityLabel(op.security)}
                        {op.requestBody ? ' | Request body declared' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!filtered.length && (
            <p className="rounded-lg border border-border p-4 text-sm">
              {k.operations.length
                ? 'No endpoints match these filters. Change the search or HTTP method.'
                : 'No endpoints declared in this specification.'}
            </p>
          )}
          {filtered.length > limit && (
            <button
              type="button"
              onClick={() => setLimit(limit + 100)}
              className="rounded border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            >
              Show 100 more endpoints
            </button>
          )}
        </div>
        <div className="min-w-0">
          {selected ? (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Selected endpoint
                  {!filtered.includes(selected)
                    ? ' | Outside current filters'
                    : ''}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedKey(undefined)}
                  className="text-xs underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Reset selection
                </button>
              </div>
              <EndpointDetails
                operation={selected}
                knowledge={k}
                snapshot={snapshot}
              />
            </>
          ) : (
            <p className="rounded-lg border border-border p-5 text-sm text-muted-foreground">
              Select an endpoint to inspect its specification.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
