export function calendarDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : undefined;
}
export function timestamp(value: string | null | undefined) {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(
      value,
    ) ||
    !calendarDate(value.slice(0, 10))
  )
    return undefined;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date : undefined;
}
export function formatDateTime(
  value: string | null | undefined,
  timeZone: string,
) {
  const day = calendarDate(value);
  if (day)
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(day);
  const date = timestamp(value);
  if (!date) return 'Time unavailable';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
      timeZoneName: 'shortOffset',
    }).format(date);
  } catch {
    return 'Time unavailable';
  }
}
