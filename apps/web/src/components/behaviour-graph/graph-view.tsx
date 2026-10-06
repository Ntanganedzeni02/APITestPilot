'use client';
import { useMemo, useState } from 'react';
import type { GraphEdge, GraphNode, GraphSnapshot } from '@testpilot/domain';
import { graphRules, createGraphIndex } from '@testpilot/behaviour-graph';

export function FactReason({ fact }: { fact: GraphNode | GraphEdge }) {
  const p = fact.provenance;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer">Why this relationship exists</summary>
      <div className="mt-2 space-y-2 break-words">
        <p>
          {p.derivation} · {p.confidence} · {p.ruleId}
        </p>
        <p>
          {graphRules[p.ruleId as keyof typeof graphRules] ?? 'Unknown rule'}
        </p>
        <ul>
          {p.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <p className="break-all">Import: {p.importId}</p>
        <ul className="break-all">
          {p.sourcePointers.map((pointer) => (
            <li key={pointer}>{pointer}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}
function Relationships({
  index,
  node,
}: {
  index: ReturnType<typeof createGraphIndex>;
  node: GraphNode;
}) {
  // Recursive schema edges appear in both directions; render each fact once.
  const links = [
    ...new Map(
      [...index.incoming(node.id), ...index.outgoing(node.id)].map((edge) => [
        edge.id,
        edge,
      ]),
    ).values(),
  ];
  const schemaIds = new Set(
    index.outgoing(node.id).flatMap((e) =>
      index
        .outgoing(e.to)
        .filter((link) => link.type.endsWith('USES_SCHEMA'))
        .map((link) => link.to),
    ),
  );
  return (
    <div>
      {node.type === 'OPERATION' && (
        <p className="mt-3 break-words text-sm">
          Referenced input/output schemas:{' '}
          {[...schemaIds].map((id) => index.nodes.get(id)!.label).join(', ') ||
            'None declared as local component references'}
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {links.map((e) => (
          <li
            key={e.id}
            className="min-w-0 rounded-md border border-border p-3"
          >
            <p className="break-words text-sm">
              {index.nodes.get(e.from)?.label} → {index.nodes.get(e.to)?.label}
            </p>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {e.type}
            </p>
            <FactReason fact={e} />
          </li>
        ))}
      </ul>
    </div>
  );
}
function NodeInspection({
  node,
  index,
  label = node.label,
}: {
  node: GraphNode;
  index: ReturnType<typeof createGraphIndex>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="mt-3 min-w-0 rounded-lg border border-border p-4"
    >
      <summary className="cursor-pointer break-words font-semibold">
        {label}
      </summary>
      {open && (
        <>
          <FactReason fact={node} />
          <Relationships index={index} node={node} />
        </>
      )}
    </details>
  );
}
function NodeList({
  nodes,
  index,
  types = false,
}: {
  nodes: GraphNode[];
  index: ReturnType<typeof createGraphIndex>;
  types?: boolean;
}) {
  const [limit, setLimit] = useState(100);
  return (
    <>
      {nodes.slice(0, limit).map((n) => (
        <NodeInspection
          key={n.id}
          node={n}
          index={index}
          label={types ? `${n.type}: ${n.label}` : n.label}
        />
      ))}
      {limit < nodes.length && (
        <button
          className="mt-3 rounded-md border border-border px-4 py-2"
          onClick={() => setLimit(limit + 100)}
        >
          Show 100 more ({nodes.length - limit} remaining)
        </button>
      )}
    </>
  );
}
export function GraphView({ snapshot }: { snapshot: GraphSnapshot }) {
  const g = snapshot.graph;
  const index = useMemo(() => createGraphIndex(g), [g]);
  const count = (type: string) => g.nodes.filter((n) => n.type === type).length;
  return (
    <section className="mt-8 min-w-0 space-y-6" aria-label="Behaviour Graph">
      <div>
        <h2 className="text-xl font-semibold">Behaviour Graph</h2>
        <p className="mt-2 text-sm">
          Deterministic specification knowledge. Relationships describe
          structural intent; runtime behaviour has not been verified.
        </p>
        <p className="mt-3 break-all text-xs">
          Snapshot {snapshot.id} · {snapshot.createdAt}
          <br />
          Source import {g.importId} · builder {g.builderVersion} · model{' '}
          {g.modelVersion}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Nodes', g.nodes.length],
            ['Edges', g.edges.length],
            ['Resources', count('RESOURCE')],
            ['Operations', count('OPERATION')],
            ['Schemas', count('SCHEMA')],
            [
              'Security relationships',
              g.edges.filter((e) => e.type === 'OPERATION_REQUIRES_SECURITY')
                .length,
            ],
            ['Identifiers', count('IDENTIFIER')],
            ['Possible state values', count('STATE')],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <h3 className="text-lg font-semibold">Resources and possible states</h3>
        <p className="mt-2 text-xs">
          No state transitions are inferred. Identifier dependencies indicate
          compatible structure, not mandatory execution order.
        </p>
        {!count('RESOURCE') && (
          <p className="mt-3 text-sm">
            No resources met the conservative inference rules.
          </p>
        )}
        <NodeList
          key={`${snapshot.id}:resources`}
          nodes={g.nodes.filter((n) => n.type === 'RESOURCE')}
          index={index}
        />
      </div>
      <div>
        <h3 className="text-lg font-semibold">Operation relationships</h3>
        <NodeList
          key={`${snapshot.id}:operations`}
          nodes={g.nodes.filter((n) => n.type === 'OPERATION')}
          index={index}
        />
      </div>
      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer font-semibold">
          All graph facts and provenance
        </summary>
        <NodeList
          key={`${snapshot.id}:all`}
          nodes={g.nodes}
          index={index}
          types
        />
      </details>
    </section>
  );
}
