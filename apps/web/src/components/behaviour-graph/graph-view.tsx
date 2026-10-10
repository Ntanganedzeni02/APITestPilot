'use client';
import { useId, useMemo, useState } from 'react';
import {
  graphNodeTypes,
  type GraphEdge,
  type GraphNode,
  type GraphSnapshot,
} from '@testpilot/domain';
import { graphRules, createGraphIndex } from '@testpilot/behaviour-graph';
import { LocalTime } from '../ui/local-time';
import { TechnicalDetails } from '../api-map/spec-details';
import {
  filterGraph,
  graphWindow,
  graphPositions,
  relationshipLabel,
  nodeLabel,
  connectedNodes,
  edgeCurve,
} from './presentation';
export { relationshipLabel } from './presentation';

export function FactReason({ fact }: { fact: GraphNode | GraphEdge }) {
  const p = fact.provenance;
  return (
    <div className="mt-1">
      <p className="text-xs text-muted-foreground">
        {p.derivation === 'EXPLICIT'
          ? 'Declared in specification'
          : 'Deterministically inferred'}{' '}
        | {p.confidence.toLowerCase()} confidence
      </p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">
          Why this relationship exists
        </summary>
        <p className="mt-2 break-words">
          {graphRules[p.ruleId as keyof typeof graphRules] ??
            'Rule explanation unavailable; inspect provenance.'}
        </p>
        <ul className="mt-2 list-inside list-disc break-words">
          {p.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
        <TechnicalDetails
          value={fact}
          label="Technical details: exact fact and provenance"
        />
      </details>
    </div>
  );
}
export function GraphCanvas({
  nodes,
  edges,
  selectedId,
  onSelect,
  zoom = 1,
  panX = 0,
  panY = 0,
  focused = false,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId?: string | undefined;
  onSelect: (id: string) => void;
  zoom?: number;
  panX?: number;
  panY?: number;
  focused?: boolean;
}) {
  const marker = useId().replaceAll(':', '');
  const layout = useMemo(
    () => graphPositions(nodes, edges, focused ? selectedId : undefined),
    [nodes, edges, focused, selectedId],
  );
  const connected = useMemo(
    () => connectedNodes(edges, selectedId),
    [edges, selectedId],
  );
  return (
    <svg
      role="group"
      aria-label="Interactive stored Behaviour Graph"
      className="h-[420px] sm:h-[480px] w-full rounded-lg border border-border bg-surface"
      viewBox={`${(layout.width * (1 - 1 / zoom)) / 2 + (panX * layout.width) / zoom} ${(layout.height * (1 - 1 / zoom)) / 2 + (panY * layout.height) / zoom} ${layout.width / zoom} ${layout.height / zoom}`}
    >
      <title>
        Stored nodes and directional relationships. Use the structured list for
        full keyboard access.
      </title>
      <defs>
        <marker
          id={marker}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const a = layout.points.get(e.from),
          b = layout.points.get(e.to);
        if (!a || !b) return null;
        const highlighted = e.from === selectedId || e.to === selectedId;
        return (
          <path
            key={e.id}
            data-connected={highlighted}
            d={edgeCurve(a, b, ((i % 5) - 2) * 10)}
            fill="none"
            stroke={highlighted ? 'var(--primary)' : 'var(--muted-foreground)'}
            strokeWidth={highlighted ? 2.5 : 1.2}
            strokeDasharray={
              e.provenance.derivation === 'EXPLICIT' ? undefined : '5 4'
            }
            markerEnd={`url(#${marker})`}
            opacity={selectedId ? (highlighted ? 1 : 0.15) : 0.6}
          >
            <title>
              {relationshipLabel(e.type)} |{' '}
              {e.provenance.derivation === 'EXPLICIT' ? 'Declared' : 'Inferred'}
            </title>
          </path>
        );
      })}
      {nodes.map((n) => {
        const p = layout.points.get(n.id)!;
        return (
          <g
            key={n.id}
            role="button"
            tabIndex={0}
            data-connected={connected.has(n.id)}
            opacity={selectedId && !connected.has(n.id) ? 0.45 : 1}
            aria-label={`${nodeLabel(n.type)}: ${n.label}`}
            aria-pressed={selectedId === n.id}
            onClick={() => onSelect(n.id)}
            onKeyDown={(e) => {
              const navigation =
                e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? -1
                    : undefined;
              if (navigation !== undefined) {
                e.preventDefault();
                const buttons =
                  e.currentTarget.parentElement!.querySelectorAll<SVGGElement>(
                    '[role="button"]',
                  );
                const next =
                  (nodes.findIndex((node) => node.id === n.id) +
                    navigation +
                    nodes.length) %
                  nodes.length;
                buttons[next]?.focus();
                return;
              }
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(n.id);
              }
            }}
            className="cursor-pointer outline-none focus-visible:[&>rect]:stroke-[var(--ring)]"
            transform={`translate(${p.x},${p.y})`}
          >
            <title>{n.label}</title>
            <rect
              x="-108"
              y="-26"
              width="224"
              height="52"
              rx={n.type === 'OPERATION' ? 4 : n.type === 'RESOURCE' ? 20 : 8}
              fill="var(--surface)"
              stroke={
                selectedId === n.id
                  ? 'var(--primary)'
                  : n.type === 'OPERATION'
                    ? 'var(--information)'
                    : n.type === 'RESOURCE'
                      ? 'var(--success)'
                      : n.type === 'SCHEMA'
                        ? 'var(--warning)'
                        : 'var(--border)'
              }
              strokeWidth={selectedId === n.id ? 3 : 2}
            />
            <text
              textAnchor="middle"
              y="-8"
              fontSize="16"
              fill="var(--muted-foreground)"
            >
              {nodeLabel(n.type)}
            </text>
            <text
              textAnchor="middle"
              y="11"
              fontSize="20"
              fill="var(--foreground)"
            >
              {n.label.length > 21 ? n.label.slice(0, 18) + '...' : n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
export function GraphView({ snapshot }: { snapshot: GraphSnapshot }) {
  const g = snapshot.graph;
  const inspectionId = useId();
  const [type, setType] = useState('ALL'),
    [relationship, setRelationship] = useState('ALL'),
    [search, setSearch] = useState(''),
    [selectedId, setSelectedId] = useState<string | undefined>(
      g.nodes.find((n) => n.type === 'OPERATION')?.id,
    ),
    [zoom, setZoom] = useState(1),
    [page, setPage] = useState(0),
    [neighborhood, setNeighborhood] = useState(true);
  const [panX, setPanX] = useState(0),
    [panY, setPanY] = useState(0);
  const index = useMemo(() => createGraphIndex(g), [g]);
  const filtered = useMemo(
    () => filterGraph(g, type, relationship, search),
    [g, type, relationship, search],
  );
  const visible = useMemo(
    () =>
      graphWindow(
        filtered,
        filtered.nodes.find((n) => n.id === selectedId)?.id ??
          filtered.nodes.find((n) => n.type === 'OPERATION')?.id ??
          filtered.nodes[0]?.id,
        neighborhood,
      ),
    [filtered, selectedId, neighborhood],
  );
  const selected =
    filtered.nodes.find((n) => n.id === selectedId) ??
    filtered.nodes.find((n) => n.type === 'OPERATION') ??
    filtered.nodes[0];
  const links = selected
    ? [
        ...new Map(
          [...index.incoming(selected.id), ...index.outgoing(selected.id)].map(
            (e) => [e.id, e],
          ),
        ).values(),
      ]
    : [];
  const selectNode = (id: string | undefined) => {
    setSelectedId(id);
    setZoom(1);
    setPanX(0);
    setPanY(0);
    if (typeof document !== 'undefined')
      requestAnimationFrame(() => {
        const panel = document.getElementById(inspectionId);
        panel?.focus({ preventScroll: true });
        if (panel) {
          const bounds = panel.getBoundingClientRect();
          if (bounds.top < 0 || bounds.top > window.innerHeight - 80)
            panel.scrollIntoView({ block: 'start' });
        }
      });
  };
  const changeFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(0);
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };
  return (
    <section className="min-w-0 space-y-3" aria-label="Behaviour Graph">
      <header>
        <h2 className="text-lg font-semibold">Behaviour Graph</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Specification relationships only; runtime behaviour has not been
          verified.
        </p>
        <p className="mt-2 text-xs">
          Snapshot created <LocalTime value={snapshot.createdAt} />
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Stored graph nodes', g.nodes.length],
          ['Stored graph edges', g.edges.length],
          [
            'Graph schema nodes',
            g.nodes.filter((n) => n.type === 'SCHEMA').length,
          ],
          [
            'Inferred resource nodes',
            g.nodes.filter((n) => n.type === 'RESOURCE').length,
          ],
        ].map(([label, count]) => (
          <div key={label} className="rounded-lg border border-border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-semibold">{count}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="form-label">
          Search graph
          <input
            className="form-input"
            value={search}
            onChange={(e) => changeFilter(setSearch, e.target.value)}
            placeholder="Node name"
          />
        </label>
        <label className="form-label">
          Node type
          <select
            className="form-input"
            value={type}
            onChange={(e) => changeFilter(setType, e.target.value)}
          >
            <option value="ALL">All node types</option>
            {graphNodeTypes
              .filter((t) => g.nodes.some((n) => n.type === t))
              .map((t) => (
                <option key={t} value={t}>
                  {nodeLabel(t)}
                </option>
              ))}
          </select>
        </label>
        <label className="form-label">
          Relationship
          <select
            className="form-input"
            value={relationship}
            onChange={(e) => changeFilter(setRelationship, e.target.value)}
          >
            <option value="ALL">All relationships</option>
            {[...new Set(g.edges.map((e) => e.type))].map((t) => (
              <option key={t} value={t}>
                {relationshipLabel(t)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          className="rounded border border-border px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => {
            setZoom(1);
            setPanX(0);
            setPanY(0);
          }}
        >
          Fit to view
        </button>
        <button
          type="button"
          aria-label="Zoom out graph"
          onClick={() => setZoom(Math.max(1, zoom - 0.5))}
          disabled={zoom <= 1}
          className="rounded border border-border px-3 py-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
        >
          Zoom out
        </button>
        <button
          type="button"
          aria-label="Zoom in graph"
          onClick={() => setZoom(Math.min(8, zoom + 0.5))}
          disabled={zoom >= 8}
          className="rounded border border-border px-3 py-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
        >
          Zoom in
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        {(['left', 'right', 'up', 'down'] as const).map((direction) => (
          <button
            type="button"
            key={direction}
            aria-label={`Pan graph ${direction}`}
            className="rounded border border-border px-2 py-2 focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              if (direction === 'left' || direction === 'right')
                setPanX(panX + (direction === 'left' ? -0.2 : 0.2));
              else setPanY(panY + (direction === 'up' ? -0.2 : 0.2));
            }}
          >
            Pan {direction}
          </button>
        ))}
        <label className="form-label">
          Graph view
          <select
            aria-label="Graph view"
            className="form-input"
            value={neighborhood ? 'focused' : 'full'}
            onChange={(e) => {
              setNeighborhood(e.target.value === 'focused');
              setZoom(1);
              setPanX(0);
              setPanY(0);
            }}
          >
            <option value="focused">Operation / selected-node focus</option>
            <option value="full">Full graph</option>
          </select>
        </label>
        <label className="form-label">
          Operation
          <select
            aria-label="Focus operation"
            className="form-input"
            value={selected?.type === 'OPERATION' ? selected.id : ''}
            onChange={(e) => selectNode(e.target.value)}
          >
            <option value="" disabled>
              Select an operation
            </option>
            {filtered.nodes
              .filter((n) => n.type === 'OPERATION')
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
          </select>
        </label>
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {filtered.nodes.length} matching nodes | {filtered.edges.length}{' '}
        relationships between matching nodes. Visual map shows{' '}
        {visible.nodes.length} of {visible.totalNodes} nodes and{' '}
        {visible.edges.length} of {visible.totalEdges} edges between displayed
        nodes. Solid lines: declared; dashed lines: inferred. Arrowheads show
        stored direction.
      </p>
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="min-w-0">
          {' '}
          {filtered.nodes.length ? (
            <GraphCanvas
              nodes={visible.nodes}
              edges={visible.edges}
              selectedId={selected?.id}
              onSelect={selectNode}
              zoom={zoom}
              panX={panX}
              panY={panY}
              focused={neighborhood}
            />
          ) : (
            <p className="rounded-lg border border-border p-4">
              No graph nodes match these filters.
            </p>
          )}
        </div>
        <section
          className="min-w-0 rounded-lg border border-border p-3 xl:sticky xl:top-4"
          aria-label="Selected graph node"
          id={inspectionId}
          tabIndex={-1}
          aria-live="polite"
        >
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h3 className="break-words font-semibold">{selected.label}</h3>
                <button
                  type="button"
                  onClick={() => selectNode(undefined)}
                  className="text-xs underline"
                >
                  Reset selection
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {nodeLabel(selected.type)}
              </p>
              <FactReason fact={selected} />
              <h4 className="mt-4 text-sm font-semibold">
                Stored relationships ({links.length})
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Includes relationships outside the current filters. No state
                transitions are inferred.
              </p>
              <ul className="mt-3 space-y-1">
                {links.slice(0, 4).map((e) => (
                  <li
                    key={e.id}
                    className="rounded border border-border p-2 text-sm"
                  >
                    <p>
                      {index.nodes.get(e.from)?.label}{' '}
                      <span className="text-muted-foreground">
                        {relationshipLabel(e.type)}
                      </span>{' '}
                      {index.nodes.get(e.to)?.label}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const id = e.from === selected.id ? e.to : e.from;
                        setType('ALL');
                        setRelationship('ALL');
                        setSearch('');
                        setPage(0);
                        selectNode(id);
                      }}
                      className="mt-1 text-xs underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      Inspect related node
                    </button>
                    <FactReason fact={e} />
                  </li>
                ))}
              </ul>
              {links.length > 4 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium">
                    More relationships ({links.length - 4})
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {links.slice(4, 100).map((e) => (
                      <li
                        key={e.id}
                        className="rounded border border-border p-2 text-xs"
                      >
                        <p>
                          {index.nodes.get(e.from)?.label} |{' '}
                          {relationshipLabel(e.type)} |{' '}
                          {index.nodes.get(e.to)?.label}
                        </p>
                        <button
                          type="button"
                          className="mt-1 underline focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => {
                            setType('ALL');
                            setRelationship('ALL');
                            setSearch('');
                            setPage(0);
                            selectNode(e.from === selected.id ? e.to : e.from);
                          }}
                        >
                          Inspect related node
                        </button>
                        <FactReason fact={e} />
                      </li>
                    ))}
                  </ul>
                  {links.length > 100 && (
                    <TechnicalDetails
                      value={links}
                      label="Technical details: complete relationship records"
                    />
                  )}
                </details>
              )}
              {!links.length && (
                <p className="mt-2 text-sm">
                  No relationships stored for this node.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a node in the map or list to inspect its relationships and
              provenance.
            </p>
          )}
        </section>
      </div>
      <section className="min-w-0 rounded-lg border border-border p-4">
        <h3 className="font-semibold">Accessible node explorer</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          All matching nodes are available here, including those outside the
          visual map.
        </p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.nodes.slice(page * 50, (page + 1) * 50).map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  selectNode(n.id);
                }}
                aria-pressed={selected?.id === n.id}
                className={`w-full break-words rounded border px-2 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring ${selected?.id === n.id ? 'border-primary' : 'border-border'}`}
              >
                <span className="block text-xs text-muted-foreground">
                  {nodeLabel(n.type)}
                </span>
                {n.label}
              </button>
            </li>
          ))}
        </ul>
        {filtered.nodes.length > 50 && (
          <div className="mt-3 flex items-center gap-3 text-xs">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="underline disabled:opacity-50"
            >
              Previous nodes
            </button>
            <span>
              Page {page + 1} of {Math.ceil(filtered.nodes.length / 50)}
            </span>
            <button
              type="button"
              disabled={(page + 1) * 50 >= filtered.nodes.length}
              onClick={() => setPage(page + 1)}
              className="underline disabled:opacity-50"
            >
              Next nodes
            </button>
          </div>
        )}
      </section>
      <TechnicalDetails
        value={snapshot}
        label="Technical details: complete graph snapshot and provenance"
      />
    </section>
  );
}
