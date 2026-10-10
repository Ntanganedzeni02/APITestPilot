'use client';
import { useState } from 'react';
import {
  canReview,
  reviewState,
  type QaItem,
  type QaReview,
} from '@testpilot/domain';
import { QaActionForm } from './action-form';
export function RequirementReview({
  item,
  role,
}: {
  item: QaItem;
  role: string;
}) {
  const noun = item.kind === 'RISK' ? 'risk' : 'requirement';
  const current = reviewState(item);
  const [decision, setDecision] = useState<QaReview['decision']>(
    canReview(role, 'APPROVE') ? 'APPROVE' : 'EDIT',
  );
  if (!(['APPROVE', 'EDIT', 'REJECT'] as const).some((d) => canReview(role, d)))
    return (
      <p className="text-sm text-muted-foreground">
        Your workspace role does not allow {noun} reviews.
      </p>
    );
  return (
    <QaActionForm
      label={
        decision === 'APPROVE'
          ? 'Confirm approval'
          : decision === 'REJECT'
            ? 'Confirm rejection'
            : 'Confirm changes'
      }
      successMessage="Review saved. Status and summary counts reflect the latest recorded decision."
    >
      <input type="hidden" name="mode" value="REVIEW" />
      <input type="hidden" name="itemId" value={item.id} />
      <input
        type="hidden"
        name="expectedReviewId"
        value={item.reviews.at(-1)?.id ?? ''}
      />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-semibold">Review {noun}</legend>
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
              className="flex cursor-pointer items-center gap-2 rounded border border-border px-3 py-2 text-sm"
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
      <p className="text-xs text-muted-foreground">
        Choose an action, then confirm it. Request changes records your revised
        text and returns this {noun} to review. Approval never authorizes API
        execution.
      </p>
      <fieldset
        key={item.reviews.at(-1)?.id ?? 'original'}
        hidden={decision !== 'EDIT'}
        disabled={decision !== 'EDIT'}
        className="space-y-3"
      >
        <legend className="text-sm font-medium">Revise {noun}</legend>
        <label className="form-label">
          Title
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={current.title}
            className="form-input"
          />
        </label>
        <label className="form-label">
          Statement
          <textarea
            name="statement"
            required
            maxLength={4000}
            defaultValue={current.statement}
            rows={4}
            className="form-input"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Unsaved edits stay here when you switch review actions. Confirmed
          changes preserve the original and require re-review.
        </p>
      </fieldset>
      <label className="form-label">
        Review rationale{' '}
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
    </QaActionForm>
  );
}
