import { expect, it } from 'vitest';
import type { QaAnalysis, TestPlan } from '@testpilot/domain';
import { planReviewIsCurrent } from './bulk';
const analysis = {
  id: 'analysis',
  records: [
    { id: 'requirement', kind: 'REQUIREMENT', reviews: [{ id: 'review' }] },
  ],
} as unknown as QaAnalysis;
const plan = {
  analysisId: 'analysis',
  requirements: [{ id: 'requirement', reviewId: 'review' }],
} as unknown as TestPlan;
it('permits matching requirement review snapshots only', () => {
  expect(planReviewIsCurrent(plan, analysis)).toBe(true);
  expect(planReviewIsCurrent(plan, undefined)).toBe(false);
  expect(planReviewIsCurrent({ ...plan, analysisId: 'other' }, analysis)).toBe(
    false,
  );
});
it('rejects stale and incomplete planning snapshots', () => {
  expect(planReviewIsCurrent({ ...plan, requirements: [] }, analysis)).toBe(
    false,
  );
  expect(
    planReviewIsCurrent(plan, {
      ...analysis,
      records: [{ ...analysis.records[0]!, reviews: [] }],
    }),
  ).toBe(false);
});
