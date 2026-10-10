'use client';
import { useState } from 'react';
import {
  reviewState,
  requirementCategories,
  riskCategories,
  type QaAnalysis,
  type QaItem,
  type GraphSnapshot,
} from '@testpilot/domain';
import { BulkReview } from '../ui/bulk-review';
import { bulkContextKey } from '../../lib/reviews/bulk';
import { Metric } from '../ui/product';
import { readableStatus } from '../../lib/display';
import { relationshipLabel } from '../behaviour-graph/presentation';
import { TechnicalDetails } from '../api-map/spec-details';
import { LocalTime } from '../ui/local-time';
import { FiltersPanel, activeFilterCount } from '../ui/filters-panel';
import { QaActionForm } from './action-form';
import { RequirementReview } from './requirement-review';
import {
  requirementCounts,
  filterRequirements,
  requirementEntities,
  requirementSources,
  requirementStatuses,
} from './requirement-presentation';
export function RequirementCard({
  item,
  graph,
  role,
  number,
}: {
  item: QaItem;
  graph: GraphSnapshot | null;
  role: string;
  number: number;
}) {
  const [loaded, setLoaded] = useState(false),
    current = reviewState(item),
    entities = requirementEntities(item, graph);
  const nodes = new Map(graph?.graph.nodes.map((n) => [n.id, n]) ?? []);
  const edges =
    graph?.graph.edges.filter((e) => item.edgeRefs.includes(e.id)) ?? [];
  return (
    <details
      className="min-w-0 rounded-lg border border-border bg-surface p-3"
      onToggle={(e) => {
        if (e.currentTarget.open) setLoaded(true);
      }}
    >
      <summary className="cursor-pointer break-words focus-visible:outline-2 focus-visible:outline-ring">
        <span className="text-xs text-muted-foreground">
          {item.kind === 'RISK' ? 'Risk' : 'Requirement'} {number} |{' '}
          {entities.slice(0, 3).join(' / ') ||
            'Historical entity details unavailable'}
          {entities.length > 3 ? ` +${entities.length - 3} more` : ''}
        </span>
        <span className="mt-1 block font-semibold">{current.title}</span>
        <span className="mt-2 flex flex-wrap gap-2 text-xs">
          <span
            className={`rounded border px-2 py-0.5 ${current.status === 'APPROVED' ? 'border-success/40 text-success' : current.status === 'REJECTED' ? 'border-danger/40 text-danger' : 'border-warning/40 text-warning'}`}
          >
            {current.status === 'PROPOSED' && current.edited
              ? 'Awaiting re-review'
              : requirementStatuses[current.status]}
          </span>
          {item.kind === 'RISK' && item.severity && (
            <span className="rounded border border-border px-2 py-0.5 font-medium">
              {readableStatus(item.severity)} severity
            </span>
          )}
          <span className="rounded bg-muted px-2 py-0.5">
            {readableStatus(item.category)}
          </span>
          <span className="text-muted-foreground">
            {requirementSources[item.sourceKind]}
          </span>
        </span>
      </summary>
      {loaded && (
        <div className="mt-4 min-w-0 space-y-4 text-sm">
          <section>
            <h3 className="font-semibold">
              {item.kind === 'RISK' ? 'Risk statement' : 'Requirement'}
            </h3>
            <p className="mt-2 whitespace-pre-wrap break-words">
              {current.statement}
            </p>
            {current.edited && (
              <p className="mt-2 text-xs text-muted-foreground">
                Human-revised text. Original text is preserved in technical
                details; revisions require re-review.
              </p>
            )}
          </section>
          <section>
            <h3 className="font-semibold">
              {item.kind === 'RISK' ? 'Why it matters' : 'Why it exists'}
            </h3>
            <p className="mt-2 whitespace-pre-wrap break-words">
              {item.reason}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {requirementSources[item.sourceKind]} |{' '}
              {readableStatus(item.confidence)} confidence. Specification or
              proposal evidence, not verified runtime behavior.
            </p>
          </section>
          <section>
            <h3 className="font-semibold">Evidence / Traceability</h3>
            <ul className="mt-2 space-y-1">
              {entities.map((name) => (
                <li className="break-words" key={name}>
                  {name}
                </li>
              ))}
            </ul>
            {!entities.length && (
              <p className="mt-2 text-muted-foreground">
                Historical entity details are unavailable. Original references
                are preserved below.
              </p>
            )}
            {edges.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs">
                  Linked graph relationships ({edges.length})
                </summary>
                <ul className="mt-2 space-y-2">
                  {edges.map((e) => (
                    <li key={e.id} className="break-words">
                      {nodes.get(e.from)?.label ?? 'Historical entity'} |{' '}
                      {relationshipLabel(e.type)} |{' '}
                      {nodes.get(e.to)?.label ?? 'Historical entity'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <TechnicalDetails
              value={item}
              label={`Technical details: original ${item.kind === 'RISK' ? 'risk' : 'requirement'} and full provenance`}
            />
          </section>
          <section>
            <h3 className="font-semibold">
              Review history{' '}
              <span className="text-xs font-normal text-muted-foreground">
                ({item.reviews.length})
              </span>
            </h3>
            {item.reviews.length ? (
              <ol className="mt-2 space-y-2">
                {item.reviews.map((r, index) => (
                  <li className="rounded border border-border p-3" key={r.id}>
                    <p className="text-sm font-medium">
                      Review {index + 1}:{' '}
                      {r.decision === 'EDIT'
                        ? 'Changes requested'
                        : r.decision === 'APPROVE'
                          ? 'Approved'
                          : 'Rejected'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <LocalTime value={r.createdAt} />
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words">
                      {r.rationale || 'No rationale provided.'}
                    </p>
                    {r.decision === 'EDIT' && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs">
                          Recorded revision
                        </summary>
                        <p className="mt-2 font-medium">{r.title}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words">
                          {r.statement}
                        </p>
                      </details>
                    )}
                    <TechnicalDetails
                      value={r}
                      label="Technical details: reviewer identity and audit record"
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-muted-foreground">No reviews recorded.</p>
            )}
          </section>
          <RequirementReview item={item} role={role} />
        </div>
      )}
    </details>
  );
}
export function RequirementsView({
  analysis,
  graph,
  role,
  kind = 'REQUIREMENT',
  bulkBlocked,
}: {
  kind?: QaItem['kind'];
  bulkBlocked?: string;
  analysis: QaAnalysis;
  graph: GraphSnapshot | null;
  role: string;
}) {
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('ALL'),
    [category, setCategory] = useState('ALL'),
    [source, setSource] = useState('ALL'),
    [entity, setEntity] = useState('ALL'),
    [limit, setLimit] = useState(50),
    [severity, setSeverity] = useState('ALL');
  const isRisk = kind === 'RISK',
    noun = isRisk ? 'risks' : 'requirements';
  const categories = isRisk ? riskCategories : requirementCategories;
  const activeFilters = activeFilterCount(
    [status, category, source, entity, ...(isRisk ? [severity] : [])].map(
      (value) => ({ value, defaultValue: 'ALL' }),
    ),
  );
  const items = analysis.records.filter((i) => i.kind === kind),
    counts = requirementCounts(analysis, kind),
    filtered = filterRequirements(
      analysis,
      graph,
      {
        search,
        status,
        category,
        source,
        entity,
        severity,
      },
      kind,
    );
  const numbers = new Map(items.map((i, index) => [i.id, index + 1]));
  const visible = filtered.slice(0, limit);
  const bulkItems = visible.map((item) => ({
    id: item.id,
    title: reviewState(item).title,
    label: `${kind === 'RISK' ? 'Risk' : 'Requirement'} ${numbers.get(item.id)}: ${reviewState(item).title}`,
    statement: reviewState(item).statement,
    pending: !bulkBlocked && reviewState(item).status === 'PROPOSED',
    expectedReviewId: item.reviews.at(-1)?.id ?? null,
  }));
  return (
    <section
      className="mt-5 min-w-0 space-y-4"
      aria-label={isRisk ? 'Risks review' : 'Requirements review'}
    >
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [isRisk ? 'Total risks' : 'Total', counts.total],
          ['Awaiting review', counts.awaiting],
          ['Approved', counts.approved],
          ['Rejected', counts.rejected],
        ].map(([label, value]) => (
          <Metric key={label} label={String(label)} value={value} />
        ))}
      </dl>
      {isRisk && (
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            Specification-derived risk signals, not confirmed vulnerabilities.
            Approval never authorizes execution.
          </p>
          <dl className="flex flex-wrap gap-x-5 gap-y-2">
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((level) => (
              <div className="flex gap-2" key={level}>
                <dt>{readableStatus(level)} severity</dt>
                <dd className="font-semibold">
                  {items.filter((i) => i.severity === level).length}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
          Source breakdown
        </summary>
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {Object.entries(requirementSources).map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd className="font-semibold">
                {items.filter((i) => i.sourceKind === key).length}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2">
          AI analysis:{' '}
          {analysis.aiStatus === 'NOT_CONFIGURED'
            ? 'Not configured'
            : analysis.aiStatus === 'SUCCEEDED'
              ? 'Proposals recorded'
              : 'Unavailable'}
          . {analysis.aiFailure}
        </p>
      </details>
      <div className="flex flex-wrap items-end gap-3">
        <label className="form-label">
          Search {noun}
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(50);
            }}
            placeholder="Title, statement or endpoint"
            className="form-input"
          />
        </label>
      </div>
      <FiltersPanel
        activeCount={activeFilters}
        onClear={() => {
          setStatus('ALL');
          setCategory('ALL');
          setSource('ALL');
          setEntity('ALL');
          setSeverity('ALL');
          setLimit(50);
        }}
      >
        {(
          [
            [
              'Status',
              status,
              setStatus,
              [['ALL', 'All statuses'], ...Object.entries(requirementStatuses)],
            ],
            [
              'Category',
              category,
              setCategory,
              [
                ['ALL', 'All categories'],
                ...categories.map((c) => [c, readableStatus(c)]),
              ],
            ],
            [
              'Source',
              source,
              setSource,
              [['ALL', 'All sources'], ...Object.entries(requirementSources)],
            ],
          ] as const
        ).map(([label, value, set, options]) => (
          <label key={label} className="form-label">
            {label}
            <select
              className="form-input"
              value={value}
              onChange={(e) => {
                set(e.target.value);
                setLimit(50);
              }}
            >
              {options.map(([id, text]) => (
                <option key={id} value={id}>
                  {text}
                </option>
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
        {isRisk && (
          <label className="form-label">
            Severity
            <select
              className="form-input"
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setLimit(50);
              }}
            >
              <option value="ALL">All severities</option>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((v) => (
                <option key={v} value={v}>
                  {readableStatus(v)}
                </option>
              ))}
            </select>
          </label>
        )}
      </FiltersPanel>
      <p role="status" className="text-xs text-muted-foreground">
        Showing {Math.min(limit, filtered.length)} of {filtered.length} matching
        {noun}. Summary counts cover this entire analysis.
      </p>
      {!filtered.length && (
        <p className="rounded-lg border border-border p-4 text-sm">
          {items.length
            ? `No ${noun} match these filters. Adjust your search or filters.`
            : `No ${noun} in this analysis. Choose another analysis or create one from an imported specification.`}
        </p>
      )}
      {bulkBlocked && (
        <p role="status" className="text-sm text-muted-foreground">
          {bulkBlocked} Individual reviews remain available.
        </p>
      )}
      <BulkReview
        key={
          bulkContextKey(analysis.id, kind, bulkItems) +
          JSON.stringify([
            search,
            status,
            category,
            source,
            entity,
            severity,
            role,
          ])
        }
        family="QA"
        parentId={analysis.id}
        kind={kind}
        role={role}
        items={bulkItems}
      >
        {(checkbox) => (
          <>
            {visible.map((item) => (
              <div key={item.id}>
                {checkbox(item.id)}
                <RequirementCard
                  key={item.id}
                  item={item}
                  number={numbers.get(item.id)!}
                  graph={graph}
                  role={role}
                />
              </div>
            ))}
          </>
        )}
      </BulkReview>
      {limit < filtered.length && (
        <button
          type="button"
          className="rounded border border-border px-3 py-2 text-sm"
          onClick={() => setLimit(limit + 50)}
        >
          Show 50 more {noun}
        </button>
      )}
      {graph && (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-medium">
            Add human {isRisk ? 'risk' : 'requirement'}
          </summary>
          <QaActionForm label="Add human proposal">
            <input type="hidden" name="mode" value="ADD" />
            <input type="hidden" name="analysisId" value={analysis.id} />
            <input type="hidden" name="kind" value={kind} />
            {[
              ['title', 'Title', 160],
              ['statement', 'Statement', 4000],
              ['reason', 'Reason', 2000],
            ].map(([name, label, max]) => (
              <label key={name} className="form-label">
                {label}
                {name === 'title' ? (
                  <input
                    name={String(name)}
                    required
                    maxLength={Number(max)}
                    className="form-input"
                  />
                ) : (
                  <textarea
                    name={String(name)}
                    required
                    maxLength={Number(max)}
                    rows={3}
                    className="form-input"
                  />
                )}
              </label>
            ))}
            <label className="form-label">
              Category
              <select name="category" className="form-input">
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {readableStatus(c)}
                  </option>
                ))}
              </select>
            </label>
            {isRisk && (
              <label className="form-label">
                Severity
                <select name="severity" className="form-input">
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((v) => (
                    <option key={v} value={v}>
                      {readableStatus(v)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-label">
              Graph evidence
              <select name="nodeId" className="form-input">
                {graph.graph.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
          </QaActionForm>
        </details>
      )}
      <TechnicalDetails
        value={{
          analysisId: analysis.id,
          importId: analysis.importId,
          graphId: analysis.graphId,
          createdAt: analysis.createdAt,
          createdBy: analysis.createdBy,
          engineVersion: analysis.engineVersion,
          builderVersion: graph?.graph.builderVersion,
          aiStatus: analysis.aiStatus,
          aiMetadata: analysis.aiMetadata,
          aiFailure: analysis.aiFailure,
        }}
        label="Technical details: analysis source and audit metadata"
      />
    </section>
  );
}
