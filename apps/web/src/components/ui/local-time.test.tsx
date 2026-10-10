import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  LocalTime,
  LocalDateOption,
  serverTimeZone,
  browserTimeZone,
} from './local-time';
it('server and hydration snapshot have no server timezone and show a neutral placeholder', () => {
  expect(serverTimeZone()).toBe('');
  const html = renderToStaticMarkup(<LocalTime value="2026-10-08T11:14:00Z" />);
  expect(html).toContain('Loading local time');
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain('11:14 GMT');
  expect(html).not.toContain('13:14 GMT');
  expect(html).toContain('title="UTC: 2026-10-08T11:14:00.000Z"');
  expect(html).toContain('dateTime="2026-10-08T11:14:00Z"');
});
it('uses browser Intl timezone automatically', () => {
  expect(browserTimeZone()).toBe(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
});
it('options preserve identity and avoid invalid nested markup during hydration', () => {
  const html = renderToStaticMarkup(
    <select>
      <LocalDateOption
        value="stable-id"
        timestamp="2026-10-08T11:14:00Z"
        prefix="Catalog API"
      />
    </select>,
  );
  expect(html).toContain('value="stable-id"');
  expect(html).toContain('Catalog API | Date loading');
  expect(html).not.toContain('<time');
});
it('calendar dates and unavailable timestamps render consistently on the server', () => {
  expect(renderToStaticMarkup(<LocalTime value="2026-01-01" />)).toContain(
    '1 Jan 2026',
  );
  expect(renderToStaticMarkup(<LocalTime value={null} />)).toContain(
    'Time unavailable',
  );
});
