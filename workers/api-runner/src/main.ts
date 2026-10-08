import { readRunnerConfig } from './config.js';
import {
  WorkerHealth,
  WorkerPersistenceError,
  persistResult,
  runWorker,
  healthServer,
} from './operations.js';
import { constructExecution, requestFingerprint } from '@testpilot/test-engine';
import { evaluateSafety } from '@testpilot/safety';
import type {
  ExecutionRun,
  ExecutionTarget,
  TestPlan,
  ApiImportSummary,
} from '@testpilot/domain';
import {
  executeAuthorized,
  systemResolver,
  pinnedConnector,
  type Resolver,
  type Connector,
} from './index.js';
interface Job {
  run: ExecutionRun & {
    claim_token: string;
    case_review_id: string;
    scenario_review_id: string;
    claim_expires_at: string;
    claim_generation: number;
  };
  target: ExecutionTarget;
  plan: TestPlan;
  source: ApiImportSummary;
}
export interface WorkerStore {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
}
export async function processNext(
  store: WorkerStore,
  resolver: Resolver = systemResolver,
  connector: Connector = pinnedConnector,
  options: { signal?: AbortSignal; health?: WorkerHealth } = {},
) {
  const job = (await store.rpc('claim_test_execution', {})) as Job | null;
  if (options.health) {
    options.health.lastPoll = Date.now();
    options.health.lastDatabaseSuccess = Date.now();
  }
  if (!job) return false;
  const { run } = job;
  if (
    !run.claim_expires_at ||
    !Number.isFinite(Date.parse(run.claim_expires_at)) ||
    !Number.isSafeInteger(run.claim_generation) ||
    run.claim_generation < 1
  )
    throw Error('Runner recovery migration required');
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  if (options.health) {
    options.health.activeRun = run.id;
    options.health.lastRenewal = null;
    options.health.phase = 'UNSENT';
    options.health.log('CLAIMED');
  }
  let renewing = false;
  let active = true;
  const renew = async () => {
    if (renewing || !active || controller.signal.aborted) return;
    renewing = true;
    try {
      const stop = await store.rpc('execution_cancel_requested', {
        run_input: run.id,
        token_input: run.claim_token,
      });
      if (!active) return;
      if (stop) throw Error('CLAIM_FENCED');
      if (options.health) {
        options.health.lastRenewal = Date.now();
        options.health.lastDatabaseSuccess = Date.now();
      }
    } catch {
      if (!active) return;
      controller.abort();
      if (options.health) {
        options.health.leaseFailures++;
        options.health.log('LEASE_LOST', 'CLAIM_FENCED');
      }
    } finally {
      renewing = false;
    }
  };
  const heartbeat = setInterval(() => {
    void renew();
  }, 1000);
  const started = Date.now();
  try {
    await renew();
    if (controller.signal.aborted) throw Error('Claim fenced');
    return await processClaim(
      store,
      job,
      resolver,
      connector,
      controller,
      options.health,
    );
  } catch (error) {
    if (options.health) {
      if (options.health.phase === 'SEND_INTENT')
        options.health.pendingReconciliation++;
      options.health.log(
        'PROCESSING_FAILED',
        options.health.phase === 'SEND_INTENT'
          ? 'INDETERMINATE'
          : 'CLAIM_FENCED',
        Date.now() - started,
      );
    }
    throw error;
  } finally {
    active = false;
    clearInterval(heartbeat);
    options.signal?.removeEventListener('abort', abort);
    if (options.health) options.health.activeRun = null;
  }
}
async function processClaim(
  store: WorkerStore,
  job: Job,
  resolver: Resolver,
  connector: Connector,
  controller: AbortController,
  health?: WorkerHealth,
) {
  const { run, plan, target, source } = job;
  const item = plan.records.find((i) => i.id === run.case_id);
  if (!item) throw Error('Invalid worker context');
  const compiled = constructExecution(plan, item, source, target);
  const context = {
    target,
    request: compiled.request,
    planningReady: compiled.planningReady,
    credentialsRequired: compiled.credentialsRequired,
    dependencyRequired: compiled.dependencyRequired,
    readinessFailure: compiled.failure,
    sideEffects: compiled.sideEffects,
  };
  const fingerprint = compiled.request
    ? requestFingerprint(compiled.request, {
        case: run.case_id,
        config: run.config_id,
        caseReview: run.case_review_id,
        scenarioReview: run.scenario_review_id,
        policy: '1.0.0',
      })
    : null;
  if (run.status === 'SAFETY_REVIEW') {
    let addresses: string[] = [];
    try {
      addresses = await resolver.resolve(
        new URL(compiled.request?.url ?? target.baseUrl).hostname,
        AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(target.timeoutMs),
        ]),
      );
    } catch {
      /* Unresolved DNS is a deterministic block. */
    }
    const decision = evaluateSafety({ ...context, addresses });
    await store.rpc('record_execution_safety', {
      run_input: run.id,
      token_input: run.claim_token,
      decision_input: decision.decision,
      codes_input: decision.codes,
      facts_input: decision.facts,
      request_input: compiled.request,
      fingerprint_input: fingerprint,
    });
    health?.log('SAFETY_RECORDED', 'PERSISTED');
    return true;
  }
  if (run.status !== 'RUNNING') throw Error('Invalid worker transition');
  if (fingerprint !== run.fingerprint) {
    await persistResult(store, {
      run_input: run.id,
      token_input: run.claim_token,
      result_input: {
        outcome: 'BLOCKED',
        failure: 'REQUEST_FINGERPRINT_CHANGED',
        response: null,
        assertions: [],
        sent: false,
      },
    });
    return true;
  }
  {
    if (
      await store.rpc('execution_cancel_requested', {
        run_input: run.id,
        token_input: run.claim_token,
      })
    )
      controller.abort();
    const result = await executeAuthorized(
      context,
      run.decision === 'ALLOW' || run.approved_fingerprint === fingerprint,
      controller.signal,
      resolver,
      connector,
      async () => {
        if (health) health.phase = 'SEND_INTENT';
        const allowed =
          (await store.rpc('authorize_execution_send', {
            run_input: run.id,
            token_input: run.claim_token,
            fingerprint_input: fingerprint,
            config_input: run.config_id,
            policy_input: '1.0.0',
          })) === true;
        if (health) {
          if (allowed) health.log('SEND_INTENT');
          else health.phase = 'UNSENT';
        }
        return allowed;
      },
    );
    await persistResult(store, {
      run_input: run.id,
      token_input: run.claim_token,
      result_input: result,
    });
    const ambiguous =
      health?.phase === 'SEND_INTENT' &&
      ['ERROR', 'CANCELLED', 'BLOCKED'].includes(result.outcome);
    if (health) {
      if (ambiguous) health.pendingReconciliation++;
      health.phase = 'TERMINAL';
    }
    health?.log('FINISHED', ambiguous ? 'INDETERMINATE' : 'PERSISTED');
  }
  return true;
}
export function restWorkerStore(
  url: string,
  publishableKey: string,
  runnerToken: string,
): WorkerStore {
  const config = readRunnerConfig({
    ...process.env,
    RUNNER_SUPABASE_URL: url,
    RUNNER_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    RUNNER_DATABASE_TOKEN: runnerToken,
  });
  const base = new URL(config.url);
  return {
    async rpc(name, args) {
      if (
        ![
          'claim_test_execution',
          'record_execution_safety',
          'finish_test_execution',
          'execution_cancel_requested',
          'authorize_execution_send',
        ].includes(name)
      )
        throw Error('Unknown runner RPC');
      try {
        readRunnerConfig({
          ...process.env,
          RUNNER_SUPABASE_URL: url,
          RUNNER_SUPABASE_PUBLISHABLE_KEY: publishableKey,
          RUNNER_DATABASE_TOKEN: runnerToken,
        });
      } catch {
        throw new WorkerPersistenceError('AUTH_REJECTED');
      }
      let response: Response;
      try {
        response = await fetch(new URL('/rest/v1/rpc/' + name, base), {
          method: 'POST',
          redirect: 'error',
          headers: {
            apikey: publishableKey,
            authorization: 'Bearer ' + runnerToken,
            'content-type': 'application/json',
          },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw new WorkerPersistenceError('DATABASE_UNAVAILABLE');
      }
      if (response.status === 401 || response.status === 403)
        throw new WorkerPersistenceError('AUTH_REJECTED');
      if (response.status >= 500)
        throw new WorkerPersistenceError('DATABASE_UNAVAILABLE');
      if (!response.ok) throw Error('Persistence transition rejected');
      return response.status === 204 ? null : response.json();
    },
  };
}
// No user API credentials are supported. This token is a server-only dedicated
// database role credential, never a service-role token or browser configuration.
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/main.js')) {
  const { url, key, token } = readRunnerConfig(process.env);
  const store = restWorkerStore(url, key, token);
  const health = new WorkerHealth((line) => process.stdout.write(line));
  const server = healthServer(health);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(9090, '127.0.0.1', resolve);
  });
  const shutdown = new AbortController();
  process.once('SIGINT', () => shutdown.abort());
  process.once('SIGTERM', () => shutdown.abort());
  const exitCode = await runWorker(
    (signal) =>
      processNext(store, systemResolver, pinnedConnector, { signal, health }),
    health,
    shutdown.signal,
  );
  server.close();
  // A forced deadline may leave a persistence promise unresolved. Durable intent fences recovery.
  process.exit(exitCode);
}
