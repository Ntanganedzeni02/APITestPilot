import { setTimeout as delay } from 'node:timers/promises';
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
) {
  const job = (await store.rpc('claim_test_execution', {})) as Job | null;
  if (!job) return false;
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
        AbortSignal.timeout(target.timeoutMs),
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
    return true;
  }
  if (run.status !== 'RUNNING') throw Error('Invalid worker transition');
  if (fingerprint !== run.fingerprint) {
    await store.rpc('finish_test_execution', {
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
  const controller = new AbortController();
  let polling = false;
  const interval = setInterval(() => {
    if (polling) return;
    polling = true;
    store
      .rpc('execution_cancel_requested', {
        run_input: run.id,
        token_input: run.claim_token,
      })
      .then((cancel) => {
        if (cancel) controller.abort();
      })
      .catch(() => controller.abort())
      .finally(() => {
        polling = false;
      });
  }, 250);
  try {
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
      async () =>
        (await store.rpc('authorize_execution_send', {
          run_input: run.id,
          token_input: run.claim_token,
          fingerprint_input: fingerprint,
          config_input: run.config_id,
          policy_input: '1.0.0',
        })) === true,
    );
    await store.rpc('finish_test_execution', {
      run_input: run.id,
      token_input: run.claim_token,
      result_input: result,
    });
  } finally {
    clearInterval(interval);
  }
  return true;
}
export function restWorkerStore(
  url: string,
  publishableKey: string,
  runnerToken: string,
): WorkerStore {
  let role: unknown;
  try {
    role = JSON.parse(
      Buffer.from(runnerToken.split('.')[1] ?? '', 'base64url').toString(
        'utf8',
      ),
    ).role;
  } catch {
    throw Error('Dedicated runner token required');
  }
  if (role !== 'testpilot_runner')
    throw Error('Dedicated runner role required');
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password)
    throw Error('Worker database requires HTTPS');
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
      const response = await fetch(new URL('/rest/v1/rpc/' + name, base), {
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
      if (!response.ok) throw Error('Worker persistence failed');
      return response.status === 204 ? null : response.json();
    },
  };
}
// No user API credentials are supported. This token is a server-only dedicated
// database role credential, never a service-role token or browser configuration.
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/main.js')) {
  const url = process.env['RUNNER_SUPABASE_URL'],
    key = process.env['RUNNER_SUPABASE_PUBLISHABLE_KEY'],
    token = process.env['RUNNER_DATABASE_TOKEN'];
  if (!url || !key || !token)
    throw Error('Runner database configuration required');
  const store = restWorkerStore(url, key, token);
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  while (!stopping) {
    try {
      if (!(await processNext(store))) await delay(1000);
    } catch {
      process.stderr.write(
        'Execution worker operation failed; no automatic network retry.\n',
      );
      await delay(1000);
    }
  }
}
