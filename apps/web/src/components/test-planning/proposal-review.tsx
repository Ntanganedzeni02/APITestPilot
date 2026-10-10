'use client';
import { useState } from 'react';
import {
  planningState,
  canReview,
  type TestItem,
  type WorkspaceRole,
} from '@testpilot/domain';
import { PlanningActionForm } from './action-form';
export function ProposalReview({
  item,
  role,
}: {
  item: TestItem;
  role: WorkspaceRole;
}) {
  const state = planningState(item);
  const [decision, setDecision] = useState<'APPROVE' | 'EDIT' | 'REJECT'>(
    canReview(role, 'APPROVE') ? 'APPROVE' : 'EDIT',
  );
  return (
    <PlanningActionForm
      label={
        decision === 'APPROVE'
          ? 'Confirm approval'
          : decision === 'REJECT'
            ? 'Confirm rejection'
            : 'Submit revision'
      }
    >
      <input type="hidden" name="mode" value="REVIEW" />
      <input type="hidden" name="itemId" value={item.id} />
      <input
        type="hidden"
        name="expectedReviewId"
        value={item.reviews.at(-1)?.id ?? ''}
      />
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">Review action</legend>
        {(
          [
            ['APPROVE', 'Approve'],
            ['EDIT', 'Request changes'],
            ['REJECT', 'Reject'],
          ] as const
        )
          .filter(([value]) => canReview(role, value))
          .map(([value, label]) => (
            <label
              key={value}
              className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm"
            >
              <input
                type="radio"
                name="decision"
                value={value}
                checked={decision === value}
                onChange={() => setDecision(value)}
              />
              {label}
            </label>
          ))}
      </fieldset>
      <label className="form-label">
        Rationale{' '}
        <span className="text-xs text-muted-foreground">
          Optional, up to 2,000 characters
        </span>
        <textarea
          name="rationale"
          maxLength={2000}
          rows={2}
          className="form-input"
        />
      </label>
      <fieldset
        hidden={decision !== 'EDIT'}
        disabled={decision !== 'EDIT'}
        className="grid gap-2 sm:grid-cols-2"
      >
        <legend className="text-sm font-medium">Revise proposal</legend>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          A revision returns the proposal to review. Draft edits are retained
          while changing actions.
        </p>
        <label className="form-label sm:col-span-2">
          Title
          <input
            name="title"
            defaultValue={state.title}
            required
            maxLength={160}
            className="form-input"
          />
        </label>
        <label className="form-label">
          Objective
          <textarea
            name="objective"
            defaultValue={state.objective}
            required
            maxLength={4000}
            rows={3}
            className="form-input"
          />
        </label>
        <label className="form-label">
          Expected result
          <textarea
            name="expectedBehavior"
            defaultValue={state.expectedBehavior}
            required
            maxLength={4000}
            rows={3}
            className="form-input"
          />
        </label>
      </fieldset>
    </PlanningActionForm>
  );
}
