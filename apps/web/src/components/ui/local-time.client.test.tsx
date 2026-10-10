import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const state = vi.hoisted(() => ({ zone: 'Africa/Johannesburg' }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useSyncExternalStore: () => state.zone,
}));
import { LocalTime, LocalDateOption } from './local-time';
it('client renders browser-local time while retaining UTC audit metadata', () => {
  const html = renderToStaticMarkup(<LocalTime value="2026-10-08T11:14:00Z" />);
  expect(html).toContain('8 Oct 2026, 13:14 GMT+2');
  expect(html).toContain('UTC: 2026-10-08T11:14:00.000Z');
  expect(html).not.toContain('Loading local time');
});
it('client options localize dates without changing selection identity', () => {
  const html = renderToStaticMarkup(
    <select>
      <LocalDateOption
        value="analysis-id"
        timestamp="2026-10-08T11:14:00Z"
        prefix="Catalog API"
      />
    </select>,
  );
  expect(html).toContain('Catalog API | 8 Oct 2026, 13:14 GMT+2');
  expect(html).toContain('value="analysis-id"');
});
