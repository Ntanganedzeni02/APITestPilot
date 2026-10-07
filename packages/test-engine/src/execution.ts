import { createHash } from 'node:crypto';
import {
  executionLimits,
  safeReadinessCode,
  assertSafeLiteralPath,
  executionEligibility,
  type ApiImportSummary,
  type TestPlan,
  type TestItem,
  type ExecutionTarget,
  type StructuredRequest,
  type ExecutionAssertion,
  type CapturedResponse,
  type AssertionResult,
  type CaseOutcome,
} from '@testpilot/domain';
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function joinTarget(base: string, path: string) {
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[^/a-zA-Z0-9%{}._~-]/.test(path) ||
    /%(?:2f|5c|2e|3a|25)/i.test(path) ||
    path.split('/').some((p) => p === '..' || p === '.') ||
    path.length > 1500
  )
    throw Error('UNSAFE_PATH');
  assertSafeLiteralPath(path);
  const b = new URL(base);
  assertSafeLiteralPath(b.pathname);
  if (b.search || b.hash || b.username || b.password)
    throw Error('UNSAFE_TARGET');
  const u = new URL(b.origin + b.pathname.replace(/\/$/, '') + path);
  if (u.origin !== b.origin) throw Error('UNSAFE_PATH');
  return u;
}
export function synthetic(
  schema: Record<string, unknown>,
  strategy: string,
  value: unknown,
): unknown {
  const type = schema['type'];
  if (strategy === 'INCOMPATIBLE_TYPE')
    return type === 'string' ? 42 : 'synthetic-invalid';
  if (strategy === 'OMIT_REQUIRED') return undefined;
  if (strategy === 'ENUM_INDEX') {
    const e = schema['enum'];
    if (
      !Array.isArray(e) ||
      !Number.isInteger(value) ||
      (value as number) < 0 ||
      (value as number) >= e.length ||
      !['number', 'boolean'].includes(typeof e[value as number])
    )
      throw Error('UNSUPPORTED_SYMBOLIC_INPUT');
    return e[value as number];
  }
  if (strategy === 'OUTSIDE_ENUM') {
    const candidate =
      schema['type'] === 'string' ? 'testpilot-outside-enum' : -999999;
    if (Array.isArray(schema['enum']) && schema['enum'].includes(candidate))
      throw Error('UNSUPPORTED_SYMBOLIC_INPUT');
    return candidate;
  }
  if (
    [
      'NUMBER_MIN',
      'NUMBER_MAX',
      'NUMBER_BELOW',
      'NUMBER_ABOVE',
      'EXCLUSIVE_MIN',
      'EXCLUSIVE_MAX',
    ].includes(strategy)
  ) {
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw Error('UNSUPPORTED_SYMBOLIC_INPUT');
    return value;
  }
  if (
    ['LENGTH_MIN', 'LENGTH_MAX', 'LENGTH_BELOW', 'LENGTH_ABOVE'].includes(
      strategy,
    )
  ) {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 1000
    )
      throw Error('UNSUPPORTED_SYMBOLIC_INPUT');
    return 'x'.repeat(value);
  }
  if (
    !['REQUIRED_PRESENT', 'DECLARED_TYPE', 'DECLARED_CONTRACT'].includes(
      strategy,
    )
  )
    throw Error('UNSUPPORTED_SYMBOLIC_INPUT');
  if (schema['enum']) throw Error('UNSUPPORTED_SYMBOLIC_INPUT');
  if (type === 'string') {
    if (schema['format']) throw Error('UNSUPPORTED_SYMBOLIC_INPUT');
    return 'testpilot-synthetic';
  }
  if (type === 'integer' || type === 'number') return 1;
  if (type === 'boolean') return true;
  throw Error('UNSUPPORTED_SYMBOLIC_INPUT');
}
export function constructExecution(
  plan: TestPlan,
  item: TestItem,
  source: ApiImportSummary,
  target: ExecutionTarget,
): {
  request: StructuredRequest | null;
  failure: string | null;
  credentialsRequired: boolean;
  dependencyRequired: boolean;
  planningReady: boolean;
  sideEffects: boolean;
} {
  const result = {
    request: null as StructuredRequest | null,
    failure: null as string | null,
    credentialsRequired: false,
    dependencyRequired: item.preconditions.some(
      (p) =>
        p.kind === 'IDENTIFIER_FROM_OPERATION' ||
        p.kind === 'APPROVED_TEST_DATA',
    ),
    planningReady:
      executionEligibility(item, plan) === 'APPROVED_FOR_EXECUTION' ||
      executionEligibility(item, plan) === 'BLOCKED_BY_DEPENDENCY',
    sideEffects: false,
  };
  try {
    if (
      plan.importId !== source.id ||
      plan.projectId !== source.projectId ||
      plan.workspaceId !== source.workspaceId ||
      target.environmentId.length !== 36
    )
      throw Error('SOURCE_SCOPE_MISMATCH');
    const keys = item.nodeRefs.flatMap((id) => {
      try {
        const tuple = JSON.parse(id);
        return tuple[0] === 'OPERATION' ? [tuple[1]] : [];
      } catch {
        return [];
      }
    });
    const ops = source.knowledge.operations.filter((o) => keys.includes(o.key));
    if (ops.length !== 1) throw Error('AMBIGUOUS_OPERATION');
    const op = ops[0]!;
    result.credentialsRequired =
      item.preconditions.some((p) => p.kind === 'AUTH_REQUIRED') ||
      (Array.isArray(op.security) &&
        op.security.length > 0 &&
        !op.security.some((s) => Object.keys(object(s)).length === 0));
    result.sideEffects =
      item.riskRefs.length > 0 ||
      /\b(payments?|refunds?|emails?|sms|notifications?|webhooks?|delete|accounts?|transactions?)\b/i.test(
        op.path,
      );
    if (result.dependencyRequired) throw Error('BLOCKED_BY_DEPENDENCY');
    if (op.path.includes('{')) throw Error('PATH_DATA_CONFIGURATION_REQUIRED');
    let body: string | null = null;
    if (op.requestBody) {
      const content = object(op.requestBody.content);
      let schema = object(object(content['application/json'])['schema']);
      for (let depth = 0; schema['$ref'] && depth < 8; depth++) {
        const reference = schema['$ref'];
        if (
          typeof reference !== 'string' ||
          !reference.startsWith('#/components/')
        )
          throw Error('UNSUPPORTED_BODY_SCHEMA');
        let current: unknown = source.knowledge.components;
        for (const key of reference
          .slice('#/components/'.length)
          .split('/')
          .map((p) => p.replaceAll('~1', '/').replaceAll('~0', '~')))
          current = object(current)[key];
        schema = object(current);
      }
      if (schema['$ref'] || !Object.keys(schema).length)
        throw Error('UNSUPPORTED_BODY_SCHEMA');
      const applies = item.sourcePointers.some(
        (p) =>
          p.startsWith(op.requestBody!.sourcePointer) ||
          p.startsWith('#/components/schemas/'),
      );
      const strategy = applies ? item.input.strategy : 'DECLARED_TYPE';
      if (strategy !== 'OMIT_REQUIRED') {
        let value: unknown;
        if (schema['type'] === 'object' && strategy !== 'INCOMPATIBLE_TYPE') {
          const properties = object(schema['properties']);
          const required = schema['required'];
          if (!Array.isArray(required) || required.length > 10)
            throw Error('UNSUPPORTED_BODY_SCHEMA');
          const valueObject: Record<string, unknown> = {};
          for (const key of required) {
            if (
              typeof key !== 'string' ||
              /authorization|cookie|api.?key|password|secret|token|credential|email|phone/i.test(
                key,
              )
            )
              throw Error('SENSITIVE_BODY_FIELD');
            valueObject[key] = synthetic(
              object(properties[key]),
              'DECLARED_TYPE',
              null,
            );
          }
          value = valueObject;
        } else value = synthetic(schema, strategy, item.input.value);
        body = JSON.stringify(value);
      }
    }
    const url = joinTarget(target.baseUrl, op.path);
    let selected = !!op.requestBody;
    for (const p of op.parameters) {
      if (p.location !== 'query') {
        if (p.required) throw Error('UNSUPPORTED_PARAMETER_LOCATION');
        continue;
      }
      const schema = object(p.schema);
      const applies = item.sourcePointers.some(
        (x) => x === p.sourcePointer || x.startsWith(p.sourcePointer + '/'),
      );
      if (!p.required && !applies) continue;
      const v = synthetic(
        schema,
        applies ? item.input.strategy : 'DECLARED_TYPE',
        applies ? item.input.value : null,
      );
      selected ||= applies;
      if (v !== undefined) url.searchParams.set(p.name, String(v));
    }
    if (
      !selected &&
      ![
        'DECLARED_CONTRACT',
        'REVIEW_CONTRACT',
        'DECLARED_RESPONSE_SCHEMA',
      ].includes(item.input.strategy)
    )
      throw Error('UNSUPPORTED_SYMBOLIC_INPUT');
    const assertions: ExecutionAssertion[] = [];
    // Negative symbolic inputs do not justify an invented rejection status.
    if (
      ![
        'MISSING_REQUIRED',
        'INVALID_TYPE',
        'ENUM_INVALID',
        'BELOW_MIN',
        'ABOVE_MAX',
      ].includes(item.caseType ?? '')
    ) {
      const statuses = op.responses
        .map((r) => r.status)
        .filter((s) => /^\d{3}$/.test(s))
        .map(Number);
      if (statuses.length)
        assertions.push({
          kind: 'STATUS_IN_DECLARED_SET',
          expected: statuses,
          pointer: op.sourcePointer + '/responses',
        });
    }
    const request = {
      method: op.method.toUpperCase(),
      url: url.toString(),
      headers:
        body === null
          ? { accept: 'application/json, text/plain' }
          : {
              accept: 'application/json, text/plain',
              'content-type': 'application/json',
            },
      body,
      operationPointer: op.sourcePointer,
      assertions,
    };
    validateRequest(request);
    result.request = request;
  } catch (e) {
    result.failure = safeReadinessCode(e instanceof Error ? e.message : null);
  }
  return result;
}
export function safeSyntheticBody(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'number' || typeof value === 'boolean')
    return true;
  if (typeof value === 'string')
    return /^(testpilot-synthetic|synthetic-invalid|x{0,1000})$/.test(value);
  if (Array.isArray(value))
    return (
      value.length <= 10 && value.every((v) => safeSyntheticBody(v, depth + 1))
    );
  if (value && typeof value === 'object')
    return (
      Object.entries(value).length <= 10 &&
      Object.entries(value).every(
        ([key, v]) =>
          /^[a-zA-Z0-9_-]{1,80}$/.test(key) &&
          !/authorization|cookie|api.?key|password|secret|token|credential|email|phone/i.test(
            key,
          ) &&
          safeSyntheticBody(v, depth + 1),
      )
    );
  return false;
}
export function validateRequest(r: StructuredRequest) {
  assertSafeLiteralPath(new URL(r.url).pathname);
  if (r.body !== null) {
    try {
      if (!safeSyntheticBody(JSON.parse(r.body))) throw Error('Unsafe body');
    } catch {
      throw Error('UNSAFE_SYNTHETIC_BODY');
    }
  }
  if (
    r.url.length > executionLimits.url ||
    Object.keys(r.headers).length > executionLimits.headers ||
    new URL(r.url).searchParams.size > executionLimits.query ||
    (r.body !== null && Buffer.byteLength(r.body) > executionLimits.body) ||
    Object.entries(r.headers).some(
      ([k, v]) =>
        !/^[-a-z0-9]+$/i.test(k) ||
        k.length > 80 ||
        v.length > 1024 ||
        /[\r\n]/.test(v) ||
        /authorization|cookie|api[-_]?key|host|proxy|connection|transfer-encoding|content-length/i.test(
          k,
        ),
    )
  )
    throw Error('REQUEST_LIMIT_OR_SECRET_HEADER');
}
export function requestFingerprint(
  request: StructuredRequest,
  bindings: Record<string, string>,
) {
  validateRequest(request);
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, v]) => [key, canonical(v)]),
      );
    return value;
  };
  const normalized = {
    ...request,
    body: request.body === null ? null : canonical(JSON.parse(request.body)),
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical({ bindings, request: normalized })))
    .digest('hex');
}
export function evaluateAssertions(
  assertions: ExecutionAssertion[],
  response: Pick<CapturedResponse, 'status' | 'headers' | 'contentType'>,
  raw: string,
): AssertionResult[] {
  return assertions.map((a) => {
    let actual: unknown, pass: boolean | undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    switch (a.kind) {
      case 'STATUS_EQUALS':
        actual = response.status;
        pass = actual === a.expected;
        break;
      case 'STATUS_IN_DECLARED_SET':
        actual = response.status;
        pass = Array.isArray(a.expected) && a.expected.includes(actual);
        break;
      case 'CONTENT_TYPE':
        actual = response.contentType.split(';')[0];
        pass = actual === a.expected;
        break;
      case 'JSON_VALID':
        actual = parsed !== undefined;
        pass = actual === true;
        break;
      case 'BODY_PRESENT':
        actual = !!raw;
        pass = Boolean(actual);
        break;
      case 'BODY_ABSENT':
        actual = !raw;
        pass = Boolean(actual);
        break;
      case 'HEADER_PRESENT':
        actual = Object.keys(response.headers).includes(
          String(a.expected).toLowerCase(),
        );
        pass = Boolean(actual);
        break;
      case 'SCHEMA_TYPE':
        actual =
          parsed === null
            ? 'null'
            : Array.isArray(parsed)
              ? 'array'
              : typeof parsed;
        pass = parsed === undefined ? undefined : actual === a.expected;
        break;
      case 'REQUIRED_PROPERTY':
        actual = Object.prototype.hasOwnProperty.call(
          object(parsed),
          String(a.expected),
        );
        pass = parsed === undefined ? undefined : Boolean(actual);
        break;
      case 'ENUM_VALUE':
        actual = '[Value withheld]';
        pass =
          parsed === undefined
            ? undefined
            : Array.isArray(a.expected) && a.expected.includes(parsed);
        break;
    }
    return {
      ...a,
      status: pass === undefined ? 'NOT_EVALUATED' : pass ? 'PASS' : 'FAIL',
      actual: String(actual ?? '[Not evaluated]').slice(0, 200),
      reason:
        pass === undefined
          ? 'Unsupported or absent body.'
          : 'Compared observed response with declared assertion.',
    };
  });
}
export function assertionOutcome(results: AssertionResult[]): CaseOutcome {
  return results.some((r) => r.status === 'FAIL')
    ? 'FAILED'
    : results.length && results.every((r) => r.status === 'PASS')
      ? 'PASSED'
      : 'OBSERVED';
}
