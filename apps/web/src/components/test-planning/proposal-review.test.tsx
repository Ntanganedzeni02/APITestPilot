import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import type { TestItem } from '@testpilot/domain';
const m = vi.hoisted(() => ({ decision: 'APPROVE', change: vi.fn() }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: () => [m.decision, m.change],
}));
vi.mock('./action-form', () => ({
  PlanningActionForm: ({
    children,
    label,
  }: {
    children: ReactNode;
    label: string;
  }) => (
    <form>
      {children}
      <button>{label}</button>
    </form>
  ),
}));
import { ProposalReview } from './proposal-review';
const item = {
  id: 'item',
  title: 'Current title',
  objective: 'Current objective',
  expectedBehavior: 'Current expected',
  reviews: [],
} as unknown as TestItem;
beforeEach(() => {
  m.decision = 'APPROVE';
  m.change.mockReset();
});
it('ordinary approval hides and disables revision fields, with explicit confirmation', () => {
  const html = renderToStaticMarkup(
    <ProposalReview item={item} role="OWNER" />,
  );
  expect(html).toContain('Confirm approval');
  expect(html).toContain('hidden="" disabled=""');
  expect(html).toContain('Optional, up to 2,000');
  expect(html).toContain('maxLength="2000"');
});
it('revision prefills fields and retains them when switching back to approval', () => {
  m.decision = 'EDIT';
  const edited = renderToStaticMarkup(
    <ProposalReview item={item} role="OWNER" />,
  );
  expect(edited).toContain('Submit revision');
  expect(edited).toContain('value="Current title"');
  expect(edited).not.toContain('hidden=""');
  m.decision = 'APPROVE';
  const approve = renderToStaticMarkup(
    <ProposalReview item={item} role="OWNER" />,
  );
  expect(approve).toContain('value="Current title"');
  expect(approve).toContain('Current objective');
  expect(approve).toContain('hidden="" disabled=""');
});
it('rejection has a distinct confirmation without editing fields enabled', () => {
  m.decision = 'REJECT';
  expect(
    renderToStaticMarkup(<ProposalReview item={item} role="OWNER" />),
  ).toContain('Confirm rejection');
});
it('member can request changes but cannot approve or reject', () => {
  m.decision = 'EDIT';
  const html = renderToStaticMarkup(
    <ProposalReview item={item} role="MEMBER" />,
  );
  expect(html).toContain('value="EDIT"');
  expect(html).not.toContain('value="APPROVE"');
  expect(html).not.toContain('value="REJECT"');
});
