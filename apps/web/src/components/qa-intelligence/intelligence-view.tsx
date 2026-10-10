'use client';
import { LocalTime } from '../ui/local-time';
import { useState } from 'react';
import {
  reviewState,
  canReview,
  requirementCategories,
  riskCategories,
  type QaAnalysis,
  type QaItem,
  type GraphSnapshot,
  type QaKind,
} from '@testpilot/domain';
import { QaActionForm } from './action-form';
export function IntelligenceView({
  analysis,
  graph,
  kind,
  role,
}: {
  analysis: QaAnalysis;
  graph: GraphSnapshot | null;
  kind: QaKind;
  role: string;
}) {
  const [status, setStatus] = useState('ALL'),
    [category, setCategory] = useState('ALL'),
    [source, setSource] = useState('ALL'),
    [entity, setEntity] = useState('ALL'),
    [limit, setLimit] = useState(50);
  const items = analysis.records.filter((i) => i.kind === kind);
  const categories =
    kind === 'REQUIREMENT' ? requirementCategories : riskCategories;
  const filtered = items.filter(
    (i) =>
      (status === 'ALL' || reviewState(i).status === status) &&
      (category === 'ALL' || i.category === category) &&
      (source === 'ALL' || i.sourceKind === source) &&
      (entity === 'ALL' || i.nodeRefs.includes(entity)),
  );
  const names = new Map(graph?.graph.nodes.map((n) => [n.id, n.label]));
  return (
    <section className="mt-6 min-w-0 space-y-5">
      <h2 className="text-xl font-semibold">Analysis summary</h2>
      <p className="break-all text-xs">
        Analysis {analysis.id} · <LocalTime value={analysis.createdAt} />
        <br />
        Import {analysis.importId}
        <br />
        Graph {analysis.graphId} · builder{' '}
        {graph?.graph.builderVersion ?? 'historical'} · engine{' '}
        {analysis.engineVersion}
      </p>
      <p className="text-sm">
        AI analysis:{' '}
        {analysis.aiStatus === 'NOT_CONFIGURED'
          ? 'unavailable / not configured'
          : analysis.aiStatus}
        . {analysis.aiFailure}
      </p>
      <p className="text-sm">
        Total: {items.length} · Deterministic:{' '}
        {
          items.filter((i) =>
            ['SPEC_EXPLICIT', 'GRAPH_DERIVED'].includes(i.sourceKind),
          ).length
        }{' '}
        · AI proposed:{' '}
        {items.filter((i) => i.sourceKind === 'AI_PROPOSED').length} · Human:{' '}
        {items.filter((i) => i.sourceKind === 'HUMAN_AUTHORED').length} ·
        Approved:{' '}
        {items.filter((i) => reviewState(i).status === 'APPROVED').length} ·
        Rejected:{' '}
        {items.filter((i) => reviewState(i).status === 'REJECTED').length} ·
        Awaiting review:{' '}
        {items.filter((i) => reviewState(i).status === 'PROPOSED').length}
      </p>
      {kind === 'RISK' && (
        <p className="text-sm">
          Severity:{' '}
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
            .map((s) => `${s} ${items.filter((i) => i.severity === s).length}`)
            .join(' · ')}
        </p>
      )}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {[
          [
            'Status',
            status,
            setStatus,
            ['ALL', 'PROPOSED', 'APPROVED', 'REJECTED'],
          ],
          ['Category', category, setCategory, ['ALL', ...categories]],
          [
            'Source',
            source,
            setSource,
            [
              'ALL',
              'SPEC_EXPLICIT',
              'GRAPH_DERIVED',
              'AI_PROPOSED',
              'HUMAN_AUTHORED',
            ],
          ],
        ].map(([label, value, set, options]) => (
          <label key={String(label)} className="form-label">
            {String(label)}
            <select
              className="form-input"
              value={String(value)}
              onChange={(e) => {
                (set as (s: string) => void)(e.target.value);
                setLimit(50);
              }}
            >
              {(options as string[]).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        ))}
        <label className="form-label">
          API entity
          <select
            className="form-input"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setLimit(50);
            }}
          >
            <option value="ALL">All entities</option>
            {graph?.graph.nodes
              .filter((n) =>
                ['OPERATION', 'RESOURCE', 'SCHEMA'].includes(n.type),
              )
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
          </select>
        </label>
      </div>
      <p className="text-sm">
        Showing {Math.min(limit, filtered.length)} of {filtered.length}{' '}
        proposals
      </p>
      {!filtered.length && <p>No proposals match these filters.</p>}
      {filtered.slice(0, limit).map((item) => (
        <ItemDetail key={item.id} item={item} names={names} role={role} />
      ))}
      {limit < filtered.length && (
        <button
          className="rounded border px-4 py-2"
          onClick={() => setLimit(limit + 50)}
        >
          Show more proposals
        </button>
      )}
      {graph && (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-semibold">
            Add human {kind === 'REQUIREMENT' ? 'requirement' : 'risk'}
          </summary>
          <QaActionForm label="Add human proposal">
            <input type="hidden" name="mode" value="ADD" />
            <input type="hidden" name="analysisId" value={analysis.id} />
            <input type="hidden" name="kind" value={kind} />
            <label className="form-label">
              Title
              <input
                required
                name="title"
                maxLength={160}
                className="form-input"
              />
            </label>
            <label className="form-label">
              Statement
              <textarea
                required
                name="statement"
                maxLength={4000}
                className="form-input"
              />
            </label>
            <label className="form-label">
              Reason
              <textarea
                required
                name="reason"
                maxLength={2000}
                className="form-input"
              />
            </label>
            <label className="form-label">
              Proposal category
              <select name="category" className="form-input">
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {kind === 'RISK' && (
              <label className="form-label">
                Severity
                <select name="severity" className="form-input">
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-label">
              Graph evidence
              <select name="nodeId" className="form-input">
                {graph.graph.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.type}: {n.label}
                  </option>
                ))}
              </select>
            </label>
          </QaActionForm>
        </details>
      )}
    </section>
  );
}
function ItemDetail({
  item,
  names,
  role,
}: {
  item: QaItem;
  names: Map<string, string>;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const state = reviewState(item);
  return (
    <details
      className="min-w-0 rounded-lg border border-border p-4"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer break-words font-semibold">
        {state.title} · {state.status} · {item.category} {item.severity ?? ''}
      </summary>
      {open && (
        <div className="mt-4 min-w-0 space-y-3 text-sm">
          <p className="whitespace-pre-wrap break-words">{state.statement}</p>
          <p>
            {item.sourceKind} · {item.derivationType} · {item.confidence} ·{' '}
            {item.ruleId}
          </p>
          {state.edited && (
            <p className="break-words">
              Human edited proposal. Original: {item.title} — {item.statement}
            </p>
          )}
          <p className="break-words">Reason: {item.reason}</p>
          <p className="break-words">
            Affected entities:{' '}
            {item.nodeRefs.map((id) => names.get(id) ?? id).join(' · ')}
          </p>
          <details>
            <summary className="cursor-pointer">
              Provenance and linked requirements
            </summary>
            <ul className="break-all">
              {[
                ...item.sourcePointers,
                ...item.nodeRefs,
                ...item.edgeRefs,
                ...item.requirementRefs,
              ].map((ref) => (
                <li key={ref}>{ref}</li>
              ))}
            </ul>
          </details>
          <details>
            <summary className="cursor-pointer">
              Review history ({item.reviews.length})
            </summary>
            <ul>
              {item.reviews.map((r) => (
                <li key={r.id} className="mt-2 break-words">
                  {r.decision} · reviewer {r.actorId} ·{' '}
                  <LocalTime value={r.createdAt} /> · {r.rationale}
                  {r.statement && (
                    <p>
                      {r.title}: {r.statement}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
          <QaActionForm label="Record review">
            <input type="hidden" name="mode" value="REVIEW" />
            <input type="hidden" name="itemId" value={item.id} />
            <input
              type="hidden"
              name="expectedReviewId"
              value={item.reviews.at(-1)?.id ?? ''}
            />
            <label className="form-label">
              Decision
              <select name="decision" className="form-input">
                {(['APPROVE', 'REJECT', 'EDIT'] as const)
                  .filter((d) => canReview(role, d))
                  .map((d) => (
                    <option key={d}>{d}</option>
                  ))}
              </select>
            </label>
            <p className="text-xs">
              Edits reset approval and preserve the original. Only OWNER/ADMIN
              can approve or reject.
            </p>
            <label className="form-label">
              Edited title
              <input
                name="title"
                defaultValue={state.title}
                maxLength={160}
                className="form-input"
              />
            </label>
            <label className="form-label">
              Edited statement
              <textarea
                name="statement"
                defaultValue={state.statement}
                maxLength={4000}
                className="form-input"
              />
            </label>
            <label className="form-label">
              Review rationale
              <textarea
                name="rationale"
                maxLength={2000}
                className="form-input"
              />
            </label>
          </QaActionForm>
        </div>
      )}
    </details>
  );
}
