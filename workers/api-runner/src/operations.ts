import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
export class WorkerPersistenceError extends Error {
  constructor(readonly code: 'DATABASE_UNAVAILABLE' | 'AUTH_REJECTED') {
    super(code);
  }
}
export class WorkerHealth {
  readonly workerId = randomUUID();
  stopping = false;
  activeRun: string | null = null;
  lastPoll: number | null = null;
  lastDatabaseSuccess: number | null = null;
  phase: 'UNSENT' | 'SEND_INTENT' | 'TERMINAL' = 'UNSENT';
  private failureTimes: number[] = [];
  recordFailure() {
    this.failures++;
    this.failureTimes = this.failureTimes.filter((t) => this.now() - t < 60000);
    this.failureTimes.push(this.now());
    this.lastDatabaseSuccess = null;
  }
  lastRenewal: number | null = null;
  failures = 0;
  leaseFailures = 0;
  pendingReconciliation = 0;
  constructor(
    private readonly emit: (line: string) => void = () => {},
    private readonly now: () => number = Date.now,
  ) {}
  log(
    transition:
      | 'CLAIMED'
      | 'SAFETY_RECORDED'
      | 'FINISHED'
      | 'LEASE_LOST'
      | 'PROCESSING_FAILED'
      | 'STOPPING'
      | 'SEND_INTENT',
    outcome = 'NONE',
    durationMs = 0,
  ) {
    const runId =
      this.activeRun && /^[a-f0-9-]{36}$/i.test(this.activeRun)
        ? this.activeRun
        : null;
    this.emit(
      JSON.stringify({
        workerId: this.workerId,
        runId,
        correlationId: runId,
        transition,
        outcome: [
          'NONE',
          'PERSISTED',
          'INDETERMINATE',
          'DATABASE_UNAVAILABLE',
          'AUTH_REJECTED',
          'CLAIM_FENCED',
        ].includes(outcome)
          ? outcome
          : 'UNKNOWN',
        durationMs: Math.max(0, Math.floor(durationMs)),
      }) + '\n',
    );
  }
  snapshot() {
    const lastContact = this.lastDatabaseSuccess;
    const databaseConnected =
      lastContact !== null && this.now() - lastContact < 30000;
    const leaseHealthy =
      this.activeRun === null ||
      (this.lastRenewal !== null && this.now() - this.lastRenewal < 15000);
    return {
      workerId: this.workerId,
      alive: true,
      ready: !this.stopping && databaseConnected && leaseHealthy,
      databaseConnected,
      lastSuccessfulPoll: this.lastPoll,
      lastLeaseRenewal: this.lastRenewal,
      leaseHealthy,
      activeExecutions: this.activeRun ? 1 : 0,
      staleHeartbeatExecutions: this.activeRun && !leaseHealthy ? 1 : 0,
      leaseFailuresObserved: this.leaseFailures,
      reconciliationPendingObserved: this.pendingReconciliation,
      recentProcessingFailures: this.failureTimes.filter(
        (t) => this.now() - t < 60000,
      ).length,
      totalProcessingFailures: this.failures,
      scope: 'THIS_WORKER',
      stopping: this.stopping,
    };
  }
}
export function healthServer(health: WorkerHealth) {
  return createServer((request, response) => {
    if (request.url !== '/live' && request.url !== '/ready') {
      response.writeHead(404);
      response.end();
      return;
    }
    const snapshot = health.snapshot();
    response.writeHead(
      request.url === '/ready' && !snapshot.ready ? 503 : 200,
      { 'content-type': 'application/json', 'cache-control': 'no-store' },
    );
    response.end(JSON.stringify(snapshot));
  });
}
export async function persistResult(
  store: { rpc(name: string, args: Record<string, unknown>): Promise<unknown> },
  args: Record<string, unknown>,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await store.rpc('finish_test_execution', args);
      return;
    } catch (error) {
      if (
        !(error instanceof WorkerPersistenceError) ||
        error.code !== 'DATABASE_UNAVAILABLE' ||
        attempt === 2
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}
export async function runWorker(
  processOne: (signal: AbortSignal) => Promise<boolean>,
  health: WorkerHealth,
  shutdown: AbortSignal,
  deadlineMs = 30000,
) {
  const controller = new AbortController();
  let forced = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let force!: () => void;
  const expired = new Promise<void>((resolve) => {
    force = resolve;
  });
  const stop = () => {
    health.stopping = true;
    health.log('STOPPING');
    deadline = setTimeout(() => {
      forced = true;
      controller.abort();
      force();
    }, deadlineMs);
  };
  shutdown.addEventListener('abort', stop, { once: true });
  if (shutdown.aborted) stop();
  const loop = (async () => {
    while (!health.stopping) {
      try {
        if (!(await processOne(controller.signal)))
          await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (error) {
        health.recordFailure();
        health.log(
          'PROCESSING_FAILED',
          error instanceof WorkerPersistenceError
            ? error.code
            : 'INDETERMINATE',
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  })();
  try {
    await Promise.race([loop, expired]);
    return forced ? 1 : 0;
  } finally {
    if (deadline) clearTimeout(deadline);
    shutdown.removeEventListener('abort', stop);
  }
}
