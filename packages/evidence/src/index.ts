const sensitive =
  /authorization|cookie|api[-_]?key|password|passwd|secret|token|credential|session|email|phone|address|ssn|credit|card/i;
// Persist only a finite media-type vocabulary; parameters are never retained.
export function safeContentType(value: string): string {
  const type = value.split(';')[0]?.trim().toLowerCase() ?? '';
  return [
    'application/json',
    'text/plain',
    'text/html',
    'application/octet-stream',
  ].includes(type)
    ? type
    : '';
}
export function redactHeaders(
  headers: Record<string, string>,
  extra: string[] = [],
) {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers).slice(0, 20)) {
    const key = name.toLowerCase();
    // Unknown names are not retained: names themselves can contain secrets.
    if (
      ![
        'content-type',
        'content-length',
        'cache-control',
        'date',
        'accept',
        'authorization',
        'proxy-authorization',
        'cookie',
        'set-cookie',
        'x-api-key',
        'api-key',
      ].includes(key)
    )
      continue;
    result[key] =
      key === 'content-type' && !extra.some((x) => x.toLowerCase() === key)
        ? safeContentType(value)
        : '[REDACTED]';
  }
  return result;
}
export function redactJson(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[REDACTED]';
  if (typeof value === 'string') return '[REDACTED]';
  if (value === null || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (Array.isArray(value))
    return value.slice(0, 100).map((v) => redactJson(v, depth + 1));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    // Anonymize every key; retain bounded shape and non-sensitive primitive observations.
    Object.entries(value)
      .slice(0, 100)
      .forEach(([key, v], i) => {
        result['field_' + i] = sensitive.test(key)
          ? '[REDACTED]'
          : redactJson(v, depth + 1);
      });
    return result;
  }
  return '[REDACTED]';
}
export function safeBody(raw: string, type: string) {
  if (!raw) return { body: null, handling: 'EMPTY' as const };
  const media = safeContentType(type);
  if (media === 'application/json') {
    try {
      return {
        body: JSON.stringify(redactJson(JSON.parse(raw))),
        handling: 'JSON' as const,
      };
    } catch {
      return {
        body: '[Malformed JSON body withheld]',
        handling: 'REDACTED' as const,
      };
    }
  }
  if (media.startsWith('text/'))
    return {
      body: '[Text body withheld to prevent sensitive-data persistence]',
      handling: 'TEXT' as const,
    };
  return { body: null, handling: 'UNSUPPORTED' as const };
}
