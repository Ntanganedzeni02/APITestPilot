import { expect, it } from 'vitest';
import { formatDateTime } from './date-time';
const instant = '2026-10-08T11:14:00Z';
it('uses South Africa and UTC zones without changing the instant', () => {
  expect(formatDateTime(instant, 'Africa/Johannesburg')).toBe(
    '8 Oct 2026, 13:14 GMT+2',
  );
  expect(formatDateTime(instant, 'UTC')).toBe('8 Oct 2026, 11:14 GMT+0');
});
it('respects summer and winter daylight saving offsets', () => {
  expect(formatDateTime('2026-07-08T11:14:00Z', 'America/New_York')).toBe(
    '8 Jul 2026, 07:14 GMT-4',
  );
  expect(formatDateTime('2026-01-08T11:14:00Z', 'America/New_York')).toBe(
    '8 Jan 2026, 06:14 GMT-5',
  );
});
it('crosses date boundaries correctly', () => {
  expect(formatDateTime('2026-01-01T01:00:00Z', 'America/Los_Angeles')).toBe(
    '31 Dec 2025, 17:00 GMT-8',
  );
});
it('never shifts calendar-only dates', () => {
  for (const zone of ['UTC', 'Africa/Johannesburg', 'America/Los_Angeles'])
    expect(formatDateTime('2026-01-01', zone)).toBe('1 Jan 2026');
});
it('handles invalid, missing, ambiguous and impossible dates', () => {
  for (const value of [
    null,
    undefined,
    '',
    'bad',
    '2026-02-30',
    '2026-02-30T10:00:00Z',
    '2026-10-08T11:14:00',
  ])
    expect(formatDateTime(value, 'UTC')).toBe('Time unavailable');
  expect(formatDateTime(instant, 'invalid')).toBe('Time unavailable');
});
