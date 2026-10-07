# M1.9 Curiosity Engine

M1.9 Curiosity Engine is implemented. Migration `20261007000800_curiosity_engine.sql`
is deployed to hosted Supabase; local and hosted migrations are aligned through 00800.
M1.9 post-deployment verification passed. Deployed 00100 through 00700 remain unchanged.
No hosted M1.9 browser acceptance is claimed. M1.10 Evidence Memory + API Quality Intelligence is implemented locally; 00900 is
undeployed. M1.11 Release Intelligence has not started; 01000 does not exist.

## Authority and architecture

Domain owns closed investigation/proposal lifecycles, budgets, grounding and
safe binding contracts. AI supplies a provider-neutral strict structured proposal
boundary. Database loads trusted context and persists through narrow authenticated
RPCs. Presentation provides real Investigations list/detail and Finding/Run entry
points. M1.7 remains the only transport authority; M1.8 owns evidence/findings.
No configured AI provider or simulated production AI response exists. Humans can
explicitly select a grounded case and give a concise rationale without a provider.

A finding must actually occur in the selected persisted source package. Completed
runs derive evidence before investigation creation. Failed assertions and infrastructure
observations are classified from persisted results; other terminal results support
an explicit manual request. Clients submit identities, never authoritative observations.
One investigation per source package makes retries stable. It does not automatically
spawn further investigations or run a worker.

## Grounding and explainability

The closed executable hypothesis is declared-assertion repeatability. Arbitrary
user/model prose cannot become an evidence-supported conclusion. Concise rationale
and confidence remain proposals, never defect confirmation or hidden reasoning.
Follow-up cases must exist in the pinned source graph/project, resolve exactly one
known normalized operation, and be the source operation or a documented outgoing
OPERATION_PRECEDES_OPERATION neighbor. Existing case/scenario/requirement approvals
remain required. Node/edge/requirement/risk provenance comes from that trusted case.
Evidence citations belong to the source package or the selected completed dependency,
within the same tenant and environment. Invalid refs and unknown fields fail closed.

Provider input excludes raw bodies, headers, imported prose, API URLs and literal
observed values. Operation aliases are opaque; methods/assertion categories and
eligible binding references are bounded. Output has no URL/header/code/authority
fields. Runtime validation complements its strict JSON schema. No chain-of-thought
is requested, stored or displayed. No provider calls were required for this milestone.

## Safe bindings and stateful limits

At most one binding may reuse a persisted response HTTP status into a known numeric
query parameter named status, statusCode or status_code. It must cite the exact
RESPONSE_SUMMARY item; the database derives the 100?599 value from immutable results,
checks the normalized parameter type and enum, and pins it in the proposal fingerprint.
AI and clients supply references, never the numeric literal.

Other fields, credential material, unsupported parameters and response-body resource
IDs are ineligible. M1.8 capture anonymizes keys and redacts strings; field_N is not
proof of identifier provenance. Capture/redaction has not been weakened. Resource-ID
workflow execution, credentialed operations and unresolved planning dependencies remain
blocked by existing M1.7 policy/readiness. These limitations are explicit, not successful
stateful API coverage. Completed steps can become scoped dependencies for later
bounded proposals; no dependency operation is executed implicitly.

## Lifecycles, budgets and concurrency

Investigations: OPEN ? WAITING_FOR_APPROVAL ? RUNNING; CONCLUDED/STOPPED are terminal.
Proposals: PROPOSED ? APPROVED/REJECTED; APPROVED ? MATERIALIZED ? EXECUTED. Policy
blocks/cancellations without a result are represented as BLOCKED, without fabricating
an execution result or evidence package. User stop requests cancellation through M1.7;
already dispatched HTTP cannot be undone.

Database constants enforce at most 8 distinct proposals, 3 requested executable steps,
depth 2, 2 proposals per operation and one-hour submission age. Provider/client budget
fields are rejected. Equivalent proposals ignore prose/confidence, canonicalize
citations and include immutable planning/review identities, dependencies, binding refs
and resolved observed status. The identity also pins workspace/project, environment,
scenario, plan, QA, graph and import IDs. Case/scenario rows are locked and their
review identities captured once for hashing and storage. Rejected attempts still consume proposal/operation limits.
Budgets bound A ? B ? A loops independently of deduplication. Expiration prevents new
proposals/approval/materialization; previously requested M1.7 runs retain their normal
execution/cancellation lifecycle. Budget failure is a safe rejection, not a fabricated
conclusion. Stop remains available after expiration.

Investigation row locking serializes proposal creation, reviews, quota checks and
materialization. Proposal revision and exact SHA-256 fingerprint protect decisions.
Opposite concurrent review loses with 40001; duplicate materialization returns one run.
Controlled APIs cannot edit approved payloads. Changed case/scenario reviews invalidate
materialization; M1.7 separately pins and rechecks configuration and review identities.

## Safety and execution

All proposals require OWNER/ADMIN human review, even when M1.7 might later return ALLOW.
This review is not execution approval. Safety is pending until the existing worker
constructs and evaluates the request. Its authoritative ALLOW / REQUIRES_APPROVAL /
BLOCK decision is inspectable on Runs. M1.7 exact execution approval is still needed
when required; BLOCK can never execute. Production mutation restrictions are unchanged.

Without bindings, materialization requests the existing approved case. With an eligible
status binding, it atomically creates a distinct deterministic case snapshot, copies
trusted graph/QA links, records the exact human-approved proposal review and invokes
the private Curiosity request gate before the unchanged M1.7 request implementation.
The public request_test_execution wrapper rejects generated snapshots. Shared ordinary
cases remain ordinary; their Curiosity requests are bound by proposal/run records,
not a global case restriction. The private gate revalidates approval, current planning,
exact snapshot, environment, lifecycle and quotas under the investigation lock, and
atomically inserts and accounts for one request. Retries reuse that request without new work.
The existing test-engine OBSERVED_STATUS strategy accepts only
bounded numeric statuses. It builds the normal structured request, never AI HTTP.
Failure rolls back the new case, links, review, run and curiosity audit together.
No runner role, membership, table access or RPC grants were expanded: its five RPCs
remain unchanged. Only deterministic request construction supports the additional
bounded input strategy.

## Evidence, conclusions and UI

Refresh links actual terminal results through derive_execution_evidence. It does not
implement a second evidence/defect pipeline. Findings/occurrences remain authoritative
M1.8 records. Conclude requires no pending steps and resulting evidence; declared
assertion PASSED supports the closed hypothesis only when all required requested steps
passed. Actual FAILED evidence disproves it and selects a failed evidence package.
Mixed success and blocked/cancelled work is inconclusive, or BUDGET_EXHAUSTED at the
three-step ceiling; infrastructure/error is inconclusive. Supporting evidence is selected
by outcome then step creation order, never by minimum package UUID. Persisted policy-block/cancellation can conclude STOPPED_BY_POLICY
without pretending there was target HTTP or a result package. No conclusion confirms
a defect or decides a release. STOPPED prohibits new work but refresh still links late
results of existing requests, preserving stop state and idempotent evidence/audits.

UI shows source finding/package, operation, hypothesis/rationale, citations, bindings,
confidence, safety pending/run link, exact approval actor/fingerprint, dependencies,
budget, resulting evidence, conclusion and attributed bounded audit. List has status
filter, stable pagination and counts/activity; loading, unavailable and empty states
use real persistence. Saving/stale errors never report success. React escapes prose.

## Local verification

Use Node 24 / pnpm 12.9.1 for focused/full Vitest, lint, typecheck, format:check and build.
In a **fresh disposable local database only**, apply postgres-bootstrap.sql, extension
setup from safe-execution.md, then migrations 00100?00800 and run all nine SQL suites (including
curiosity-boundaries.sql)
with psql -v ON_ERROR_STOP=1. Fixtures are labeled synthetic data, never network proof.
All assertion suites roll back their rows. Never run fixture bootstrap on hosted Auth.

```powershell
node tooling/verify-curiosity-concurrency.mjs "C:/Program Files/PostgreSQL/15/bin/psql.exe" testpilot_review_m19_concurrency
node tooling/verify-evidence-concurrency.mjs "C:/Program Files/PostgreSQL/15/bin/psql.exe" testpilot_review_m18_concurrency
```

Both maintained harnesses require a fresh local-only database name, pin 127.0.0.1:55433
and use independent PostgreSQL sessions with an observed lock-wait barrier. M1.9 checks
approve vs reject, duplicate materialization, scenario-review identity locking and
competition for the final execution-budget slot; M1.8 derivation/review remain covered.
Hosted migration deployment and post-deployment verification passed. Legitimate
authenticated browser acceptance remains a separate check. This milestone makes no external API-under-test requests.
