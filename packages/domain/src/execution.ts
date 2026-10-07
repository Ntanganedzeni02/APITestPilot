import type { EnvironmentType } from './index.js';
export const executionLimits = {
  url: 2048,
  headers: 20,
  headerName: 80,
  headerValue: 1024,
  query: 30,
  body: 65536,
  response: 1048576,
  timeout: 10000,
  connection: 3000,
} as const;
export type SafetyDecision = 'ALLOW' | 'REQUIRES_APPROVAL' | 'BLOCK';
export type RunStatus =
  | 'REQUESTED'
  | 'SAFETY_REVIEW'
  | 'PENDING_APPROVAL'
  | 'AUTHORIZED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'ERROR'
  | 'BLOCKED'
  | 'CANCELLED';
export type CaseOutcome =
  'PASSED' | 'FAILED' | 'ERROR' | 'BLOCKED' | 'CANCELLED' | 'OBSERVED';
export interface ExecutionTarget {
  id: string;
  environmentId: string;
  type: EnvironmentType;
  baseUrl: string;
  enabled: boolean;
  port: number;
  timeoutMs: number;
  responseLimit: number;
}
export interface StructuredRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  operationPointer: string;
  assertions: ExecutionAssertion[];
}
export interface ExecutionAssertion {
  kind:
    | 'STATUS_IN_DECLARED_SET'
    | 'STATUS_EQUALS'
    | 'CONTENT_TYPE'
    | 'JSON_VALID'
    | 'BODY_PRESENT'
    | 'BODY_ABSENT'
    | 'SCHEMA_TYPE'
    | 'REQUIRED_PROPERTY'
    | 'ENUM_VALUE'
    | 'HEADER_PRESENT';
  expected: unknown;
  pointer: string;
}
export interface AssertionResult extends ExecutionAssertion {
  status: 'PASS' | 'FAIL' | 'NOT_EVALUATED';
  actual: string;
  reason: string;
}
export interface SafetyContext {
  target: ExecutionTarget;
  request: StructuredRequest | null;
  planningReady: boolean;
  credentialsRequired: boolean;
  dependencyRequired: boolean;
  readinessFailure: string | null;
  sideEffects: boolean;
  addresses: string[];
}
export interface SafetyEvaluation {
  decision: SafetyDecision;
  policyVersion: string;
  codes: string[];
  facts: {
    environment: EnvironmentType;
    method: string;
    target: string;
    addresses: string[];
  };
  reasons: string[];
}
export interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string | null;
  contentType: string;
  bytes: number;
  durationMs: number;
  observedAt: string;
  bodyHandling: 'JSON' | 'TEXT' | 'EMPTY' | 'UNSUPPORTED' | 'REDACTED';
}
export interface ExecutionResult {
  outcome: CaseOutcome;
  failure: ExecutionFailureCode | null;
  response: CapturedResponse | null;
  assertions: AssertionResult[];
  sent: boolean;
}
export interface ExecutionRun {
  id: string;
  workspace_id: string;
  project_id: string;
  environment_id: string;
  plan_id: string;
  case_id: string;
  config_id: string;
  status: RunStatus;
  requested_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  decision: SafetyDecision | null;
  policy_version: string | null;
  reason_codes: string[];
  fingerprint: string | null;
  approved_fingerprint: string | null;
  request: StructuredRequest | null;
  result: ExecutionResult | null;
  cancel_requested: boolean;
}
export const runTransitions: Record<RunStatus, RunStatus[]> = {
  REQUESTED: ['SAFETY_REVIEW', 'CANCELLED'],
  SAFETY_REVIEW: [
    'AUTHORIZED',
    'PENDING_APPROVAL',
    'BLOCKED',
    'ERROR',
    'CANCELLED',
  ],
  PENDING_APPROVAL: ['AUTHORIZED', 'CANCELLED', 'BLOCKED'],
  AUTHORIZED: ['RUNNING', 'CANCELLED', 'BLOCKED'],
  RUNNING: ['COMPLETED', 'ERROR', 'BLOCKED', 'CANCELLED'],
  COMPLETED: [],
  ERROR: [],
  BLOCKED: [],
  CANCELLED: [],
};
export function canTransition(from: RunStatus, to: RunStatus) {
  return runTransitions[from]?.includes(to) ?? false;
}

// Literal credential values are forbidden; semantic endpoint names remain usable.
export function assertSafeLiteralPath(path: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw Error('UNSAFE_LITERAL_PATH');
  }
  const segments = decoded.toLowerCase().split('/').filter(Boolean);
  const key =
    /^(?:token|access_token|api_key|apikey|secret|password|passwd|authorization|bearer|session|cookie|credential|client_secret)$/;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (
      /(?:token|access_token|api_key|apikey|secret|password|passwd|authorization|bearer|session|cookie|credential|client_secret)[=:\s]/i.test(
        segment,
      )
    )
      throw Error('CREDENTIAL_LITERAL_PATH');
    if (
      key.test(segment) &&
      i + 1 < segments.length &&
      !['refresh', 'revoke', 'verify', 'validate', 'status', 'reset'].includes(
        segments[i + 1]!,
      )
    )
      throw Error('CREDENTIAL_LITERAL_PATH');
    if (
      /^eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(segment) ||
      /^[a-f0-9]{32,}$/i.test(segment) ||
      (/^[a-z0-9_-]{24,}$/i.test(segment) &&
        /[a-z]/i.test(segment) &&
        /\d/.test(segment))
    )
      throw Error('CREDENTIAL_LITERAL_PATH');
  }
}

export const executionFailureCodes = [
  'CANCELLED',
  'TIMEOUT',
  'BLOCK_REQUEST_NOT_RUNNABLE',
  'SAFETY_BLOCKED',
  'BLOCK_AUTHORIZATION_STALE',
  'REQUEST_FINGERPRINT_CHANGED',
  'TRANSPORT_FAILURE',
  'RESPONSE_CAPTURE_FAILURE',
  'RESPONSE_TOO_LARGE',
  'REDIRECT_DISABLED',
  'CONNECTION_TIMEOUT',
] as const;
export type ExecutionFailureCode = (typeof executionFailureCodes)[number];
export const executionReadinessCodes = [
  'UNSAFE_PATH',
  'UNSAFE_TARGET',
  'UNSAFE_PORT',
  'UNSAFE_LITERAL_PATH',
  'CREDENTIAL_LITERAL_PATH',
  'UNSUPPORTED_SYMBOLIC_INPUT',
  'SOURCE_SCOPE_MISMATCH',
  'AMBIGUOUS_OPERATION',
  'BLOCKED_BY_DEPENDENCY',
  'PATH_DATA_CONFIGURATION_REQUIRED',
  'UNSUPPORTED_BODY_SCHEMA',
  'SENSITIVE_BODY_FIELD',
  'UNSUPPORTED_PARAMETER_LOCATION',
  'UNSAFE_SYNTHETIC_BODY',
  'REQUEST_LIMIT_OR_SECRET_HEADER',
  'REQUEST_NOT_RUNNABLE',
] as const;
export function safeReadinessCode(value: unknown): string {
  return typeof value === 'string' &&
    (executionReadinessCodes as readonly string[]).includes(value)
    ? value
    : 'REQUEST_NOT_RUNNABLE';
}
const failureMessages: Record<ExecutionFailureCode, string> = {
  CANCELLED: 'Execution cancelled.',
  TIMEOUT: 'Execution timed out.',
  BLOCK_REQUEST_NOT_RUNNABLE: 'The request is not runnable.',
  SAFETY_BLOCKED: 'Safety policy blocked this request.',
  BLOCK_AUTHORIZATION_STALE: 'Execution authorization is no longer current.',
  REQUEST_FINGERPRINT_CHANGED: 'The authorized request changed.',
  TRANSPORT_FAILURE: 'The connection failed.',
  RESPONSE_CAPTURE_FAILURE: 'Response capture failed.',
  RESPONSE_TOO_LARGE: 'The response exceeded the capture limit.',
  REDIRECT_DISABLED: 'Redirects are disabled.',
  CONNECTION_TIMEOUT: 'The connection timed out.',
};
export function executionFailureMessage(code: unknown): string {
  return typeof code === 'string' &&
    (executionFailureCodes as readonly string[]).includes(code)
    ? failureMessages[code as ExecutionFailureCode]
    : 'Execution failed.';
}
