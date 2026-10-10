import { safeReadinessCode } from '@testpilot/domain';
import { URL } from 'node:url';
import type { SafetyContext, SafetyEvaluation } from '@testpilot/domain';
export const EXECUTION_POLICY_VERSION = '1.0.0';
// Conservative public-address allow policy; IPv6 only globally routable 2000::/3,
// excluding documentation, transition, Teredo and 6to4 ranges.
export function publicAddress(ip: string): boolean {
  if (ip.includes(':')) {
    let v: string;
    try {
      v = new URL('http://[' + ip + ']/').hostname.slice(1, -1).toLowerCase();
    } catch {
      return false;
    }
    if (v.includes('.') || v.includes('%') || !/^2[0-9a-f]{3}:/.test(v))
      return false;
    if (v.startsWith('2001:') && parseInt(v.split(':')[1] || '0', 16) < 0x200)
      return false;
    if (/^(2001:(0:|0::|db8:|2:|10:|20:)|2002:|3fff:)/.test(v)) return false;
    return true;
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  const n = ip.split('.').map(Number);
  if (n.some((x) => x < 0 || x > 255)) return false;
  const [a, b, c] = n;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a! >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function validateTarget(raw: string, port: number) {
  if (raw.length > 2048 || /[\\\s]/.test(raw)) throw Error('UNSAFE_TARGET');
  const u = new URL(raw);
  if (
    !['http:', 'https:'].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !u.hostname ||
    u.hostname.endsWith('.') ||
    u.hostname.toLowerCase() === 'localhost' ||
    u.hostname.toLowerCase().endsWith('.localhost')
  )
    throw Error('UNSAFE_TARGET');
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    Number(u.port || (u.protocol === 'https:' ? 443 : 80)) !== port
  )
    throw Error('UNSAFE_PORT');
  return u;
}
export function evaluateSafety(c: SafetyContext): SafetyEvaluation {
  const codes: string[] = [];
  const method = c.request?.method ?? 'UNKNOWN';
  let base: URL | undefined;
  try {
    base = validateTarget(c.target.baseUrl, c.target.port);
    if (c.request) {
      const actual = new URL(c.request.url);
      if (
        actual.origin !== base.origin ||
        actual.username ||
        actual.password ||
        actual.hash ||
        c.request.url.length > 2048
      )
        codes.push('UNSAFE_TARGET');
    }
  } catch {
    codes.push('UNSAFE_TARGET');
  }
  if (!c.target.enabled) codes.push('TARGET_DISABLED');
  if (!c.planningReady) codes.push('PLANNING_NOT_READY');
  if (c.credentialsRequired) codes.push('CREDENTIAL_CONFIGURATION_REQUIRED');
  if (c.dependencyRequired) codes.push('BLOCKED_BY_DEPENDENCY');
  if (c.readinessFailure) codes.push(safeReadinessCode(c.readinessFailure));
  if (
    !['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(
      method,
    )
  )
    codes.push('UNSUPPORTED_METHOD');
  if (!c.addresses.length || c.addresses.some((ip) => !publicAddress(ip)))
    codes.push('UNSAFE_DNS_ADDRESS');
  if (c.target.type === 'PRODUCTION' && !['GET', 'HEAD'].includes(method))
    codes.push('PRODUCTION_MUTATION_BLOCKED');
  const approval =
    c.target.type === 'PRODUCTION' ||
    c.sideEffects ||
    !['GET', 'HEAD', 'OPTIONS'].includes(method);
  return {
    decision: codes.length ? 'BLOCK' : approval ? 'REQUIRES_APPROVAL' : 'ALLOW',
    policyVersion: EXECUTION_POLICY_VERSION,
    codes: codes.length
      ? [...new Set(codes)]
      : approval
        ? ['EXPLICIT_EXECUTION_APPROVAL_REQUIRED']
        : ['SAFE_READ'],
    reasons: codes.length
      ? [...new Set(codes)].map((x) => x.replaceAll('_', ' ').toLowerCase())
      : [
          approval
            ? 'Specific execution approval required.'
            : 'Safe read policy prerequisites satisfied.',
        ],
    facts: {
      environment: c.target.type,
      method,
      target: base?.origin ?? 'invalid',
      addresses: c.addresses,
    },
  };
}
