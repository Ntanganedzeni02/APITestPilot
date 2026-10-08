# Runner operational readiness (M1.12.2)

Migration `20261008001100_runner_recovery.sql` is additive and deployed successfully to Development. Hosted PostgreSQL 17.11 catalog/function verification passed; local/remote migrations align through 01100. The runner retains five authorized RPCs. Hosted worker runtime and HTTP execution remain untested; Docker runtime and PostgreSQL 17 CI execution remain pending. Production launch has not occurred. Do not start M1.12.3 as part of this documentation correction; the new runner rejects legacy claim snapshots without lease metadata.

## Execution state machine and atomicity

| Persisted state                         | Meaning                                                     | Atomic boundary                      |
| --------------------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| REQUESTED                               | Queued; no authorization                                    | Human request transaction            |
| SAFETY_REVIEW                           | Token-owned leased safety evaluation                        | Claim transaction                    |
| PENDING_APPROVAL                        | Requires explicit human approval                            | Safety transaction                   |
| AUTHORIZED                              | Current policy/approval allows execution                    | Safety or human approval transaction |
| RUNNING, no send timestamp              | Leased preparation, definitely no authorized send           | Execution claim transaction          |
| RUNNING, send timestamp present         | Durable send intent; target delivery may be unknown         | Final M1.7 authorization transaction |
| COMPLETED / ERROR / BLOCKED / CANCELLED | Persisted outcome when a result exists                      | Result transaction                   |
| ERROR, recovery_outcome INDETERMINATE   | Possibly sent; reconciliation required, never auto-replayed | Recovery transaction                 |

The socket send, HTTP response capture and persistence are separate from the authorization transaction. An HTTP exception or `sent=false` alone never establishes non-delivery after durable intent. Cancellation committed before the authorization snapshot blocks sending; later cancellation cannot undo delivery. Infrastructure errors are not automatic defect confirmation.

## Leases and recovery

Claims use cryptographically random ownership tokens and increasing generations. Leases last 45 seconds, renew through the existing `execution_cancel_requested` RPC every second and never exceed 120 seconds from claim start. Every write/send checks ownership and unexpired database time under the row lock. Expired tokens cannot be resurrected. Recovery runs in claim polling, bounded to 64 stale claims per call and three definitely-unsent reclaims per execution. Two independent recoverers cannot acquire the same locked row.

No send intent: clear prior safety/approval and rerun policy from REQUESTED. Cancelled or retry-exhausted work terminates. Intent recorded: preserve it and mark INDETERMINATE without inventing a result. Definitively persisted results remain unchanged. Recovery events are append-only through private functions; tenant reads use RLS. The runner still has exactly the original five RPC grants; core functions and recovery helper are private.

## Downstream uncertainty

Runs explicitly labels INDETERMINATE delivery and requires human reconciliation. Recovery without a persisted response creates no result, evidence, finding or investigation. Existing infrastructure observations remain distinct from confirmed API defects. Quality inputs retain unresolved run IDs in provenance and their fingerprint; uncertainty without derived evidence prevents prior successful execution health for the affected operation from masking the unknown. Historical verified coverage remains evidence of the historical test, not proof of this delivery. Release inputs independently include scoped indeterminate runs (including those with persisted infrastructure outcomes), producing INDETERMINATE_EXECUTION unknowns and preventing CLEAR while preserving confirmed blocker precedence. The private input/policy functions are replaced within deployed 01100; migrations 00900/01000 and human release decision authority remain unchanged.

## Retry contract

- Failed/uncertain claim acknowledgment: back off and poll; lost leased work is recovered only under the database rules. Never cache a claim for replay.
- Safety persistence: no blind retry; poll and let durable state decide the next step.
- Final send authorization: **never retry an uncertain acknowledgment** and never retry HTTP delivery.
- Result persistence: up to three attempts, only for unavailable database transport/server failures, with identical nonce and payload. A previously committed exact payload acknowledges without rewriting evidence. Invalid/fenced/authorization failures never retry.
- Cancellation or lease loss aborts the local transport. It does not prove non-delivery; durable intent still wins.

## Health and logs

Start the production artifact with `node dist/main.js`. `/live` and `/ready` listen only on `127.0.0.1:9090`; no public port or token is required/exposed. The image probes readiness. For manual inspection inside the container:

```sh
docker exec <runner-container> node -e "fetch('http://127.0.0.1:9090/ready').then(async r=>{console.log(r.status,await r.text())})"
```

Liveness reports process presence. Readiness requires a recent successful database contact, healthy active lease and no shutdown in progress. Output includes successful poll/renewal timestamps, per-worker stale-heartbeat, lease-stop and reconciliation observations, and failures in the last minute. Counters are process-local and reset on restart; they are not a complete queue-wide count. Monitor durable stale claims/recovery audit separately using authorized database observability or tenant-scoped read-only access, without granting the worker direct table reads:

```sql
select status,recovery_outcome,count(*)
from public.execution_runs
where claim_expires_at <= clock_timestamp() or recovery_outcome is not null
group by status,recovery_outcome;
```

Logs whitelist worker/run/correlation identifiers, lifecycle, category and duration. No tokens, headers, URLs, request/response bodies or exception text are logged. Alert on failed readiness, stale claims, reconciliation events and sustained database/auth failures.

## Shutdown, token rotation and reconciliation

SIGTERM/SIGINT stops new polls and allows the current bounded operation up to 30 seconds. At the deadline it aborts transport and exits nonzero; durable intent remains recoverable as INDETERMINATE. Normal drain exits zero. Unsent claims are left to the leased recovery rules rather than released without authority. Use a platform stop grace greater than 30 seconds (for example 40 seconds).

Startup and every RPC revalidate production token role/expiry. Use only a signed short-lived dedicated `testpilot_runner` token and public Supabase key. The platform verifies signatures; local shape checks do not establish authentication. Rotate through protected platform secrets, signal/drain the old process and restart with the new token. No hot credential refresher or signing secret is introduced. Expiry during processing fails closed and preserves uncertain delivery for recovery. Revocation requires the platform issuer mechanism, not merely changing an environment variable.

Investigate INDETERMINATE executions against target-side evidence using authorized humans. Never reset send intent or automatically submit another request to resolve ambiguity. Keep audit/history intact. A reviewed future reconciliation workflow must retain human/policy authority.

## Verification

Build the runner dependency closure before database harnesses. Existing quality gates and PostgreSQL 17 CI reuse all SQL suites, parity and independent-session concurrency tests. The new harness additionally kills real worker subprocesses at four send boundaries, uses only a controlled loopback mutation endpoint, races claims/recovery, introduces a real database lock timeout, tests lost persistence acknowledgment and drains a real in-flight response.

```sh
pnpm --filter @testpilot/api-runner... build
pnpm test
pnpm verify:database <psql-executable>
```

PostgreSQL 15 compatibility must be explicit with `--allow-pg15`; its passes do not prove PG17-specific grants. Hosted deployment and PostgreSQL 17.11 catalog/function verification passed. Those checks do not establish hosted worker runtime, HTTP execution or production acceptance; Docker runtime and PostgreSQL 17 CI execution remain pending.
