import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PageHeader,
  EmptyState,
  Progress,
  Disclosure,
  StatusBadge,
} from './product';
import { searchRows } from './searchable-list';
it('consistent headers and honest empty states escape untrusted text', () => {
  const html = renderToStaticMarkup(
    <>
      <PageHeader title="API <script>" />
      <EmptyState
        title="Unknown quality"
        description="No evidence has been assessed"
        href="/api-map"
        action="Inspect API"
      />
    </>,
  );
  expect(html).toContain('API &lt;script&gt;');
  expect(html).toContain('href="/api-map"');
  expect(html).not.toContain('<script>');
});
it('progress does not manufacture a percentage for a zero denominator and clamps visual output', () => {
  expect(
    renderToStaticMarkup(<Progress label="Coverage" value={0} total={0} />),
  ).toContain('Not measured');
  expect(
    renderToStaticMarkup(<Progress label="Coverage" value={0} total={0} />),
  ).not.toContain('<progress');
  expect(
    renderToStaticMarkup(<Progress label="Coverage" value={2} total={2} />),
  ).toContain('aria-label="Coverage" value="100"');
});
it('metadata is collapsed by default and statuses remain readable', () => {
  const html = renderToStaticMarkup(
    <>
      <Disclosure title="Technical audit">
        <p>Exact source retained</p>
      </Disclosure>
      <StatusBadge value="WAITING_FOR_APPROVAL" />
    </>,
  );
  expect(html).not.toContain('open=""');
  expect(html).toContain('Waiting for approval');
});
it('search only filters already supplied authorized rows and never changes their contents', () => {
  const rows = [
    { id: 'a', searchText: 'Catalog GET approved', content: 'one' },
    { id: 'b', searchText: 'Orders POST candidate', content: 'two' },
  ];
  expect(searchRows(rows, ' catalog ')).toEqual([rows[0]]);
  expect(searchRows(rows, '')).toEqual(rows);
  expect(searchRows(rows, 'another project')).toEqual([]);
  expect(rows[0]!.content).toBe('one');
});
