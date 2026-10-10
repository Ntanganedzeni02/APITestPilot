'use client';
import { useSyncExternalStore } from 'react';
import { calendarDate, timestamp, formatDateTime } from '../../lib/date-time';
function subscribe(notify: () => void) {
  window.addEventListener('focus', notify);
  return () => window.removeEventListener('focus', notify);
}
export const serverTimeZone = () => '';
export const browserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;
export function useBrowserTimeZone() {
  return useSyncExternalStore(subscribe, browserTimeZone, serverTimeZone);
}
export function LocalTime({ value }: { value: string | null | undefined }) {
  const zone = useBrowserTimeZone(),
    date = timestamp(value),
    day = calendarDate(value);
  if (!date && !day) return <span>Time unavailable</span>;
  const formatted = day
    ? formatDateTime(value, 'UTC')
    : zone
      ? formatDateTime(value, zone)
      : undefined;
  return (
    <time
      dateTime={value!}
      title={day ? `Calendar date: ${value}` : `UTC: ${date!.toISOString()}`}
      className="inline-block"
      aria-label={formatted ? undefined : 'Loading local time'}
    >
      {formatted ?? (
        <span
          className="inline-block h-4 w-40 animate-pulse rounded bg-muted align-middle"
          aria-hidden="true"
        />
      )}
    </time>
  );
}
export function LocalDateOption({
  value,
  timestamp: date,
  prefix = '',
  suffix = '',
}: {
  value: string;
  timestamp: string;
  prefix?: string;
  suffix?: string;
}) {
  const zone = useBrowserTimeZone();
  return (
    <option value={value} title={date}>
      {prefix}
      {prefix ? ' | ' : ''}
      {zone || calendarDate(date)
        ? formatDateTime(date, zone || 'UTC')
        : 'Date loading'}
      {suffix ? ' | ' + suffix : ''}
    </option>
  );
}
