import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const m = vi.hoisted(() => ({
  lock: { current: false },
  pending: false,
  replace: vi.fn(),
  state: { error: 'Selected analysis unavailable.' } as {
    error?: string;
    saved?: boolean;
    planId?: string;
    analysisId?: string;
  },
  effects: [] as (() => void)[],
}));
beforeEach(() => {
  m.lock.current = false;
  m.pending = false;
  m.replace.mockReset();
  m.effects = [];
  m.state = { error: 'Selected analysis unavailable.' };
  vi.unstubAllGlobals();
});
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useRef: () => m.lock,
  useEffect: (effect: () => void) => {
    m.effects.push(effect);
  },
  useActionState: () => [m.state, undefined, m.pending],
}));
vi.mock('../../lib/test-planning/actions', () => ({ planningAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: m.replace }),
}));
import { PlanningActionForm } from './action-form';
it('action errors remain visible and disabled generation remains disabled', () => {
  const html = renderToStaticMarkup(
    <PlanningActionForm label="Generate with AI" disabled>
      <input type="hidden" name="analysisId" value="approved" />
    </PlanningActionForm>,
  );
  expect(html).toContain('role="alert">Selected analysis unavailable.');
  expect(html).toContain('disabled=""');
  expect(html).toContain('name="analysisId" value="approved"');
});

it('blocks a second submission before the pending render', () => {
  const element = PlanningActionForm({
    label: 'Create standard plan',
    children: null,
  });
  const preventDefault = vi.fn();
  const event = { preventDefault } as unknown as Parameters<
    NonNullable<typeof element.props.onSubmit>
  >[0];
  element.props.onSubmit(event);
  expect(preventDefault).not.toHaveBeenCalled();
  element.props.onSubmit(event);
  expect(preventDefault).toHaveBeenCalledOnce();
});
it('pending submission is visibly busy and cannot submit again', () => {
  m.pending = true;
  const html = renderToStaticMarkup(
    <PlanningActionForm label="Generate with AI">Content</PlanningActionForm>,
  );
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('disabled=""');
  expect(html).toContain('Generating AI suggestions');
});

it('Standard generation opens the exact saved plan while preserving view and other query values', () => {
  m.state = {
    saved: true,
    planId: 'new-plan',
    analysisId: 'selected-analysis',
  };
  vi.stubGlobal('window', {
    location: {
      href: 'http://127.0.0.1:3000/tests?analysis=selected-analysis&plan=old-plan&view=CASE',
    },
  });
  PlanningActionForm({ label: 'Create standard plan', children: null });
  m.effects.forEach((effect) => effect());
  expect(m.replace).toHaveBeenCalledWith(
    '/tests?analysis=selected-analysis&plan=new-plan&view=CASE',
  );
});
it('errors and ordinary review success never replace the selected historical plan', () => {
  m.state = { saved: true };
  PlanningActionForm({ label: 'Confirm approval', children: null });
  m.effects.forEach((effect) => effect());
  expect(m.replace).not.toHaveBeenCalled();
});
