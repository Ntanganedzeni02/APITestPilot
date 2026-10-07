import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import {
  request as httpRequest,
  type RequestOptions,
  type ClientRequest,
  type IncomingMessage,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import { evaluateSafety } from '@testpilot/safety';
import { redactHeaders, safeBody, safeContentType } from '@testpilot/evidence';
import {
  evaluateAssertions,
  assertionOutcome,
  validateRequest,
} from '@testpilot/test-engine';
import type {
  SafetyContext,
  ExecutionResult,
  ExecutionFailureCode,
  StructuredRequest,
} from '@testpilot/domain';
export interface Resolver {
  resolve(host: string, signal: AbortSignal): Promise<string[]>;
}
export const systemResolver: Resolver = {
  async resolve(host, signal) {
    if (signal.aborted) throw Error('CANCELLED');
    const result = isIP(host.replace(/^\[|\]$/g, ''))
      ? [host.replace(/^\[|\]$/g, '')]
      : await Promise.race([
          lookup(host, { all: true, verbatim: true }).then((x) =>
            x.map((a) => a.address),
          ),
          new Promise<never>((_, reject) =>
            signal.addEventListener('abort', () => reject(Error('TIMEOUT')), {
              once: true,
            }),
          ),
        ]);
    if (result.some((ip) => !isIP(ip))) throw Error('INVALID_DNS');
    return [...new Set(result)];
  },
};
export type Connector = (
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ClientRequest;
export const pinnedConnector: Connector = (options, callback) =>
  (options.protocol === 'https:' ? httpsRequest : httpRequest)(
    options,
    callback,
  );
export async function executeAuthorized(
  context: Omit<SafetyContext, 'addresses'>,
  approved: boolean,
  signal?: AbortSignal,
  resolver: Resolver = systemResolver,
  connector: Connector = pinnedConnector,
  authorizeSend?: () => Promise<boolean>,
): Promise<ExecutionResult> {
  const failure = (
    code: ExecutionFailureCode,
    sent = false,
  ): ExecutionResult => ({
    outcome:
      code === 'CANCELLED'
        ? 'CANCELLED'
        : code.startsWith('BLOCK') || code.startsWith('SAFETY')
          ? 'BLOCKED'
          : 'ERROR',
    failure: code,
    response: null,
    assertions: [],
    sent,
  });
  if (signal?.aborted) return failure('CANCELLED');
  const controller = new AbortController();
  let sent = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, context.target.timeoutMs);
  const started = Date.now();
  try {
    const r = context.request;
    if (!r) return failure('BLOCK_REQUEST_NOT_RUNNABLE');
    validateRequest(r);
    const u = new URL(r.url);
    const addresses = await resolver.resolve(u.hostname, controller.signal);
    const safety = evaluateSafety({ ...context, addresses });
    if (
      safety.decision === 'BLOCK' ||
      (safety.decision === 'REQUIRES_APPROVAL' && !approved)
    )
      return failure('SAFETY_BLOCKED');
    if (controller.signal.aborted)
      return failure(signal?.aborted ? 'CANCELLED' : 'TIMEOUT');
    // Await trusted authorization after all DNS/target preparation. No socket exists yet.
    let removeAbort = () => {};
    let authorized = false;
    try {
      authorized =
        !!authorizeSend &&
        (await Promise.race([
          authorizeSend(),
          new Promise<boolean>((resolve) => {
            const aborted = () => resolve(false);
            controller.signal.addEventListener('abort', aborted, {
              once: true,
            });
            removeAbort = () =>
              controller.signal.removeEventListener('abort', aborted);
            if (controller.signal.aborted) resolve(false);
          }),
        ]));
    } finally {
      removeAbort();
    }
    if (controller.signal.aborted)
      return failure(signal?.aborted ? 'CANCELLED' : 'TIMEOUT');
    if (!authorized) return failure('BLOCK_AUTHORIZATION_STALE');
    return await send(
      r,
      u,
      addresses[0]!,
      context.target.responseLimit,
      controller.signal,
      () => {
        sent = true;
      },
      connector,
      started,
      signal,
    );
  } catch {
    return failure(
      signal?.aborted
        ? 'CANCELLED'
        : controller.signal.aborted
          ? 'TIMEOUT'
          : 'TRANSPORT_FAILURE',
      sent,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
function send(
  r: StructuredRequest,
  u: URL,
  address: string,
  limit: number,
  signal: AbortSignal,
  onSend: () => void,
  connector: Connector,
  started: number,
  external?: AbortSignal,
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    let settled = false,
      sent = false;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    const done = (result: ExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      signal.removeEventListener('abort', abort);
      resolve(result);
    };
    const fail = (code: ExecutionFailureCode) =>
      done({
        outcome: code === 'CANCELLED' ? 'CANCELLED' : 'ERROR',
        failure: code,
        response: null,
        assertions: [],
        sent,
      });
    const request = connector(
      {
        protocol: u.protocol,
        hostname: u.hostname.replace(/^\[|\]$/g, ''),
        port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)),
        method: r.method,
        path: u.pathname + u.search,
        headers: r.headers,
        agent: false,
        maxHeaderSize: 16384,
        lookup: (_host, options, cb) => {
          if (options.all) {
            const all = cb as unknown as (
              error: Error | null,
              addresses: { address: string; family: number }[],
            ) => void;
            all(null, [{ address, family: isIP(address) }]);
          } else cb(null, address, isIP(address));
        },
      },
      (response) => {
        clearTimeout(connectTimer);
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.destroy();
          fail('REDIRECT_DISABLED');
          return;
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > limit) {
            done({
              outcome: 'ERROR',
              failure: 'RESPONSE_TOO_LARGE',
              sent,
              response: {
                status,
                headers: redactHeaders({
                  'content-type': String(
                    response.headers['content-type'] ?? '',
                  ),
                }),
                body: null,
                bodyHandling: 'UNSUPPORTED',
                contentType: safeContentType(
                  String(response.headers['content-type'] ?? ''),
                ),
                bytes,
                durationMs: Date.now() - started,
                observedAt: new Date().toISOString(),
              },
              assertions: [],
            });
            response.destroy();
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', () => fail('RESPONSE_CAPTURE_FAILURE'));
        response.on('aborted', () => fail('RESPONSE_CAPTURE_FAILURE'));
        response.on('end', () => {
          if (settled) return;
          const raw = Buffer.concat(chunks).toString('utf8');
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(response.headers)) {
            if (v !== undefined)
              headers[k] = Array.isArray(v) ? v.join(', ') : v;
          }
          const type = headers['content-type'] ?? '';
          const body = safeBody(raw, type);
          const observed = {
            status,
            headers: redactHeaders(headers),
            body: body.body,
            bodyHandling: body.handling,
            contentType: safeContentType(type),
            bytes,
            durationMs: Date.now() - started,
            observedAt: new Date().toISOString(),
          };
          const assertions = evaluateAssertions(r.assertions, observed, raw);
          done({
            outcome: assertionOutcome(assertions),
            failure: null,
            response: observed,
            assertions,
            sent,
          });
        });
      },
    );
    const abort = () => {
      request.destroy();
      fail(external?.aborted ? 'CANCELLED' : 'TIMEOUT');
    };
    signal.addEventListener('abort', abort, { once: true });
    request.on('error', () =>
      fail(
        signal.aborted
          ? external?.aborted
            ? 'CANCELLED'
            : 'TIMEOUT'
          : 'TRANSPORT_FAILURE',
      ),
    );
    request.on('socket', (socket) => {
      connectTimer = setTimeout(() => {
        request.destroy();
        fail('CONNECTION_TIMEOUT');
      }, 3000);
      socket.once(u.protocol === 'https:' ? 'secureConnect' : 'connect', () =>
        clearTimeout(connectTimer),
      );
    });
    if (signal.aborted) {
      abort();
      return;
    }
    request.once('finish', () => {
      sent = true;
      onSend();
    });
    request.end(r.body ?? undefined);
  });
}
