import type { TestPlan, QaAnalysis } from '@testpilot/domain';
export interface BulkItem {
  id: string;
  title: string;
  label?: string;
  pending: boolean;
  expectedReviewId: string | null;
  statement?: string;
  objective?: string;
  expectedBehavior?: string;
}
export const BULK_LIMIT = 50;
export function selectedVisible(items: BulkItem[], selected: string[]) {
  return items.filter((i) => i.pending && selected.includes(i.id));
}
export function bulkContextKey(
  parent: string,
  kind: string,
  items: BulkItem[],
) {
  return JSON.stringify([
    parent,
    kind,
    items.map((i) => [i.id, i.expectedReviewId, i.pending]),
  ]);
}

export function planReviewIsCurrent(
  plan: TestPlan,
  analysis: QaAnalysis | undefined,
) {
  if (!analysis || plan.analysisId !== analysis.id) return false;
  const requirements = analysis.records.filter((r) => r.kind === 'REQUIREMENT');
  return (
    requirements.length === plan.requirements.length &&
    plan.requirements.every((v) => {
      const record = requirements.find((r) => r.id === v.id);
      return (
        record !== undefined &&
        (record.reviews.at(-1)?.id ?? null) === v.reviewId
      );
    })
  );
}
