import { caseTypes } from '@testpilot/domain';
// Display-only helpers: IDs remain unchanged in URLs, forms and persistence.
export function readableDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf())
    ? new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(date) + ' UTC'
    : 'Date unavailable';
}
export function entityName(
  title: string | undefined,
  kind: string,
  id: string,
) {
  // Stable presentation reference, independent of ordering or pagination.
  let hash = 2166136261;
  for (const character of id)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${title?.trim() || 'API'} - ${kind} ${(hash >>> 0).toString(36).toUpperCase()}`;
}
export function readableStatus(status: string) {
  return status
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export function readableProposalTitle(title: string) {
  return title
    .replace(/\bTEST_[A-Z0-9_]+\b/g, (rule) =>
      readableStatus(rule.replace(/^TEST_/, '')),
    )
    .replace(
      new RegExp('\\b(?:' + caseTypes.join('|') + ')\\b', 'g'),
      readableStatus,
    );
}

export function operationDisplay(method: string, pointer: string) {
  const match = /^#\/paths\/([^/]+)\/[a-z]+$/.exec(pointer);
  const path = match?.[1]?.replaceAll('~1', '/').replaceAll('~0', '~');
  return method + ' ' + (path ?? 'operation');
}
