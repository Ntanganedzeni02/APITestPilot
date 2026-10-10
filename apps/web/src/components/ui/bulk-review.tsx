'use client';
import { useState, useActionState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { canReview } from '@testpilot/domain';
import { bulkReviewAction } from '../../lib/reviews/actions';
import {
  BULK_LIMIT,
  selectedVisible,
  type BulkItem,
} from '../../lib/reviews/bulk';
function RefreshAfterReview() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
export function BulkReview({
  family,
  parentId,
  kind,
  role,
  items,
  children,
}: {
  family: 'QA' | 'PLANNING';
  parentId: string;
  kind: string;
  role: string;
  items: BulkItem[];
  children: (checkbox: (id: string) => ReactNode) => ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [decision, setDecision] = useState<
    'APPROVE' | 'REJECT' | 'EDIT' | null
  >(null);
  const [edits, setEdits] = useState<Record<string, BulkItem>>({});
  const [state, action, pending] = useActionState(bulkReviewAction, {});
  const eligible = items.filter((i) => i.pending);
  const chosen = selectedVisible(items, selected);
  const allowed = (['APPROVE', 'REJECT', 'EDIT'] as const).filter((d) =>
    canReview(role, d),
  );
  useEffect(() => {
    if (state.saved) {
      setSelected([]);
      setDecision(null);
      setEdits({});
    }
  }, [state]);
  function choose(value: 'APPROVE' | 'REJECT' | 'EDIT', all = false) {
    const rows = all ? eligible : chosen;
    if (all) setSelected(rows.map((i) => i.id));
    setEdits((old) => ({
      ...Object.fromEntries(rows.map((i) => [i.id, i])),
      ...old,
    }));
    setDecision(value);
  }
  const checkbox = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item?.pending || !allowed.length) return null;
    return (
      <label className="mb-2 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          aria-label={'Select ' + (item.label ?? item.title)}
          checked={selected.includes(id)}
          disabled={
            pending || (!selected.includes(id) && chosen.length >= BULK_LIMIT)
          }
          onChange={(e) => {
            setDecision(null);
            setSelected((old) =>
              e.target.checked ? [...old, id] : old.filter((x) => x !== id),
            );
          }}
        />
        Select for review
      </label>
    );
  };
  return (
    <div className="space-y-3">
      {!!eligible.length && !!allowed.length && (
        <section aria-label="Bulk review" className="product-card space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span role="status">{chosen.length} selected</span>
            <button
              type="button"
              disabled={pending || eligible.length > BULK_LIMIT}
              className="button-link"
              onClick={() => {
                setSelected(eligible.map((i) => i.id));
                setDecision(null);
              }}
            >
              Select All Visible
            </button>
            <button
              type="button"
              disabled={pending || !chosen.length}
              className="button-link"
              onClick={() => {
                setSelected([]);
                setDecision(null);
              }}
            >
              Deselect All
            </button>
            {canReview(role, 'APPROVE') && (
              <button
                type="button"
                disabled={pending || eligible.length > BULK_LIMIT}
                className="button-link"
                onClick={() => choose('APPROVE', true)}
              >
                Approve All Pending ({eligible.length})
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Only pending items currently shown below are included, up to 50 per
            transaction. Search, filters and hidden pages are excluded. Approval
            never authorizes API execution or release.
          </p>
          {eligible.length > BULK_LIMIT && (
            <p role="status">
              Narrow the filters or select up to 50 items individually.
            </p>
          )}
          {!!chosen.length && (
            <div className="flex flex-wrap gap-2">
              {allowed.map((d) => (
                <button
                  type="button"
                  key={d}
                  disabled={pending}
                  className="button-link"
                  onClick={() => choose(d)}
                >
                  {d === 'APPROVE'
                    ? 'Approve selected'
                    : d === 'REJECT'
                      ? 'Reject selected'
                      : 'Request changes for selected'}
                </button>
              ))}
            </div>
          )}
          {decision && allowed.includes(decision) && !!chosen.length && (
            <form
              action={action}
              aria-busy={pending}
              className="space-y-3 border-t border-border pt-3"
            >
              <fieldset disabled={pending} className="space-y-3">
                <legend className="font-semibold">
                  Confirm{' '}
                  {decision === 'APPROVE'
                    ? 'approval'
                    : decision === 'REJECT'
                      ? 'rejection'
                      : 'changes'}{' '}
                  of {chosen.length} items
                </legend>
                <input type="hidden" name="family" value={family} />
                <input type="hidden" name="parentId" value={parentId} />
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="decision" value={decision} />
                <input
                  type="hidden"
                  name="items"
                  value={JSON.stringify(
                    chosen.map((i) => ({
                      id: i.id,
                      expectedReviewId: i.expectedReviewId,
                      ...(decision === 'EDIT'
                        ? {
                            title: (edits[i.id] ?? i).title,
                            ...(family === 'QA'
                              ? { statement: (edits[i.id] ?? i).statement }
                              : {
                                  objective: (edits[i.id] ?? i).objective,
                                  expectedBehavior: (edits[i.id] ?? i)
                                    .expectedBehavior,
                                }),
                          }
                        : {}),
                    })),
                  )}
                />
                <label className="form-label">
                  Reason {decision === 'APPROVE' ? '(optional)' : '(required)'}
                  <textarea
                    name="rationale"
                    className="form-input"
                    required={decision !== 'APPROVE'}
                    maxLength={2000}
                  />
                </label>
                {decision === 'EDIT' && (
                  <p className="text-sm">
                    Each revision returns to awaiting review. Review the
                    prefilled text below; unchanged text may be retained with a
                    reason for further review.
                  </p>
                )}
                <ul className="space-y-2">
                  {chosen.map((i) => (
                    <li key={i.id}>
                      {decision === 'EDIT' ? (
                        <details className="product-disclosure">
                          <summary>{i.label ?? i.title}</summary>
                          <div className="space-y-2 pt-2">
                            {(
                              [
                                'title',
                                ...(family === 'QA'
                                  ? ['statement']
                                  : ['objective', 'expectedBehavior']),
                              ] as (
                                | 'title'
                                | 'statement'
                                | 'objective'
                                | 'expectedBehavior'
                              )[]
                            ).map((field) => (
                              <label key={field} className="form-label">
                                {field === 'expectedBehavior'
                                  ? 'Expected result'
                                  : field[0]!.toUpperCase() + field.slice(1)}
                                <textarea
                                  required
                                  className="form-input"
                                  maxLength={field === 'title' ? 160 : 4000}
                                  value={(edits[i.id] ?? i)[field] ?? ''}
                                  onChange={(e) =>
                                    setEdits((old) => ({
                                      ...old,
                                      [i.id]: {
                                        ...(old[i.id] ?? i),
                                        [field]: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        </details>
                      ) : (
                        <span className="text-sm">{i.label ?? i.title}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirmed" required />I reviewed
                  these {chosen.length} items and confirm this decision.
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="button-link"
                  >
                    {pending ? 'Saving batch...' : 'Confirm decision'}
                  </button>
                  <button
                    type="button"
                    className="button-link"
                    onClick={() => setDecision(null)}
                  >
                    Cancel
                  </button>
                </div>
              </fieldset>
            </form>
          )}
          {state.error && <p role="alert">{state.error}</p>}
        </section>
      )}
      {state.saved && (
        <p role="status">
          <RefreshAfterReview />
          {state.saved} individual reviews and audit events saved atomically.
          Selection cleared.
        </p>
      )}
      {children(checkbox)}
    </div>
  );
}
