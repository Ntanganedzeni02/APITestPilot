import { describe, it, expect } from 'vitest';
import { publicAddress, validateTarget, evaluateSafety } from '../src/index.js';
import { joinTarget } from '@testpilot/test-engine';
import type { SafetyContext } from '@testpilot/domain';
const context = (): SafetyContext => ({
  target: {
    id: 'config',
    environmentId: 'env',
    type: 'STAGING',
    baseUrl: 'https://api.example.test/',
    port: 443,
    enabled: true,
    timeoutMs: 1000,
    responseLimit: 1024,
  },
  request: {
    method: 'GET',
    url: 'https://api.example.test/status',
    headers: { accept: 'application/json' },
    body: null,
    assertions: [],
    operationPointer: '#/paths/status',
  },
  planningReady: true,
  credentialsRequired: false,
  dependencyRequired: false,
  readinessFailure: null,
  sideEffects: false,
  addresses: ['93.184.216.34'],
});
describe('execution safety', () => {
  it.each([
    'localhost',
    '127.0.0.1',
    '127.45.1.1',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.1.1',
    '172.31.255.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.1.1',
    '198.18.0.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd00::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '2001:db8::1',
    '2002:7f00:1::',
    '2001::1',
    '3fff::1',
    '2001:zzzz::1',
  ])('blocks unsafe address %s', (ip) => expect(publicAddress(ip)).toBe(false));
  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '2001:4860:4860::8888',
    '2606:4700:4700::1111',
  ])('allows global address %s', (ip) => expect(publicAddress(ip)).toBe(true));
  it.each([
    'file:///etc/passwd',
    'ftp://api.example.test',
    'gopher://api.example.test',
    'data:text/plain,x',
    'javascript:alert(1)',
    'ws://api.example.test',
    'wss://api.example.test',
    'https://user:pass@api.example.test/',
    'http://localhost/',
    'http://a.localhost/',
    'https://api.example.test:444/',
  ])('rejects target %s', (url) =>
    expect(() => validateTarget(url, 443)).toThrow(),
  );
  it.each([
    '//evil.com',
    'https://evil.com',
    '/\\evil.com',
    '/%2f%2fevil.com',
    '/%5cevil.com',
    '/%252fevil.com',
    '/../admin',
    '/%2e%2e/admin',
    '/x?url=http://evil.com',
  ])('rejects authority/path escape %s', (path) =>
    expect(() => joinTarget('https://api.example.test/', path)).toThrow(),
  );
  it.each(['http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/'])(
    'URL normalization exposes alternate IP %s',
    (raw) => expect(publicAddress(new URL(raw).hostname)).toBe(false),
  );
  it('allows public HTTPS read only after all facts', () =>
    expect(evaluateSafety(context()).decision).toBe('ALLOW'));
  it('supports explicit public HTTP target', () => {
    const c = context();
    c.target.baseUrl = 'http://api.example.test/';
    c.target.port = 80;
    c.request!.url = 'http://api.example.test/status';
    expect(evaluateSafety(c).decision).toBe('ALLOW');
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'mutation %s requires specific approval',
    (method) => {
      const c = context();
      c.request!.method = method;
      expect(evaluateSafety(c).decision).toBe('REQUIRES_APPROVAL');
      c.target.type = 'PRODUCTION';
      expect(evaluateSafety(c).decision).toBe('BLOCK');
    },
  );
  it('production read requires approval', () => {
    const c = context();
    c.target.type = 'PRODUCTION';
    expect(evaluateSafety(c).decision).toBe('REQUIRES_APPROVAL');
  });
  it.each([
    'planningReady',
    'credentialsRequired',
    'dependencyRequired',
    'sideEffects',
  ] as const)('readiness/metadata %s is independent', (key) => {
    const c = context();
    c[key] = key !== 'planningReady';
    expect(evaluateSafety(c).decision).toBe(
      key === 'sideEffects' ? 'REQUIRES_APPROVAL' : 'BLOCK',
    );
  });
  it.each([
    { addresses: ['10.0.0.1'] },
    { addresses: ['93.184.216.34', '10.0.0.1'] },
    { addresses: [] },
  ])('blocks private/mixed/empty DNS %j', ({ addresses }) => {
    const c = context();
    c.addresses = addresses;
    expect(evaluateSafety(c).decision).toBe('BLOCK');
  });
  it('rejects unknown method', () => {
    const c = context();
    c.request!.method = 'TRACE';
    expect(evaluateSafety(c).decision).toBe('BLOCK');
  });
  it('explicit custom port cannot be changed by a case', () => {
    const c = context();
    c.target.baseUrl = 'https://api.example.test:8443/';
    c.target.port = 8443;
    c.request!.url = 'https://api.example.test:8443/x';
    expect(evaluateSafety(c).decision).toBe('ALLOW');
    c.request!.url = 'https://api.example.test:9443/x';
    expect(evaluateSafety(c).decision).toBe('BLOCK');
  });
});
