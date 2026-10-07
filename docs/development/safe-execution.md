# M1.7 safe execution foundation

Approved deterministic case -> execution request -> independent Safety evaluation
-> exact optional human approval -> atomic worker claim -> pinned HTTP connection
-> bounded observation -> deterministic assertions -> safe result. M1.8 adds
findings; M1.9 adds local bounded curiosity using this execution boundary. Release
decisions, AI execution and load testing remain outside these milestones.

## Architecture and trust

Domain owns execution contracts, limits and state transitions. Safety owns pure
policy and conservative public-address classification. Test-engine constructs
requests from pinned normalized operations and symbolic cases, computes SHA-256
fingerprints and evaluates deterministic assertions. Evidence minimizes capture.
Database owns authenticated adapters and narrow RPCs. Next.js requests execution;
only workers/api-runner performs target HTTP. No new external package was added.

M1.6 APPROVED_FOR_EXECUTION is planning readiness, never network authorization.
SQL independently requires approved case/scenario reviews, deterministic case
origin and approved unedited deterministic pinned requirements. Review UUIDs,
plan/import/graph/analysis, environment/config and actor are derived and pinned.
Review or configuration changes invalidate queued authorization. AI/human-source
and manual human items cannot become runnable through this milestone.

REQUESTED -> SAFETY_REVIEW -> AUTHORIZED or PENDING_APPROVAL or BLOCKED.
PENDING_APPROVAL -> AUTHORIZED or CANCELLED; AUTHORIZED -> RUNNING;
RUNNING -> COMPLETED, ERROR, BLOCKED or CANCELLED. Narrow RPCs implement transitions;
ordinary clients cannot mutate status, safety or results. Terminal results are
immutable. A run contains one case; counts therefore represent one case outcome.

## Policy 1.0.0

ALLOW: public safe GET/HEAD/OPTIONS in DEVELOPMENT/STAGING with every readiness,
configuration and network check satisfied and no linked risk/sensitive operation
metadata. REQUIRES_APPROVAL: nonproduction mutation, linked risk/side-effect
metadata, or PRODUCTION GET/HEAD. PRODUCTION other methods are BLOCK. Unknown
methods, unapproved cases, unresolved dependencies, missing credential support,
unsupported materialization and unsafe DNS/targets are BLOCK. Approval resolves
only REQUIRES_APPROVAL; no role can override BLOCK.

OWNER/ADMIN configure targets and approve/reject specific privileged executions.
MEMBER can view configuration and request ready cases, never redirect targets or
approve execution. Explicit environment base URLs override no imported server
implicitly: OpenAPI server URLs are reference only. Configurations are immutable
versions; latest version must still match the request. Approval binds exact case
and scenario review UUIDs, config UUID, canonical structured request and policy
version through a SHA-256 fingerprint. Worker rebuilds and compares the fingerprint.

## SSRF and transport

Only HTTP/HTTPS. HTTPS is preferred. Reject userinfo, queries/fragments in base
URLs, whitespace/backslashes and localhost names. URL parsing normalizes accepted
alternate numeric IP forms before address validation. Reject loopback, RFC1918,
link-local/metadata, multicast, unspecified, CGNAT, documentation/benchmark and
reserved IPv4 ranges. IPv6 permits conservative global 2000::/3 only, excluding
special-use, documentation, 6to4 and transition ranges; mapped IPv4 is rejected.
Custom ports require explicit environment configuration; case paths cannot select
a different authority or port. Path joining rejects authority escapes, backslashes,
dot traversal and encoded slash/backslash/dot/colon/double-encoding tricks.

Resolver abstraction validates ALL DNS answers; one unsafe answer blocks. The
production Node HTTP/HTTPS connector receives a custom lookup returning the chosen
validated IP, preserves hostname/SNI and TLS certificate validation, uses no proxy,
and does not resolve DNS again at connection time. Worker re-resolves/rechecks
immediately before each request. Redirects are never followed, including same-origin
redirects. There is no cross-origin credential forwarding and no automatic retry.
No keepalive connection is reused across targets. Controlled local HTTP tests inject
an explicitly test-only resolver/connector; the CLI always uses production defaults.

## Requests, capture and assertions

Initial executable materialization supports primitive required/query inputs,
missing-required, incompatible-type, numeric/length boundaries and non-secret
numeric/boolean enum indices and small synthetic JSON bodies with primitive required
properties. Unsupported formats, nested/complex bodies, unsupported body strategies,
unknown concepts and path identifiers are readiness failures. No real
PII, descriptions, examples, scripts or AI values supply runtime data. Outside-enum
candidates that collide with a declared value are rejected. No dependency operation
is automatically executed or identifier fabricated. Authenticated operations block
as CREDENTIAL_CONFIGURATION_REQUIRED; runtime user API credentials/vault/OAuth are
not implemented. Required approved test-data setup also remains blocked.

Bounds: URL 2048 characters; 30 query entries; 20 headers; names 80/value 1024;
request body 64 KiB, restricted to validated synthetic JSON; total safe request JSON
128 KiB. Overall request/DNS/capture timeout at most 10 seconds, connection timeout
3 seconds. Response capture at most 1 MiB and response header block 16 KiB. Oversize
capture destroys the stream, records RESPONSE_TOO_LARGE and retains safe metadata.
No unbounded body read, decompression, file download or binary blob persistence.

Response status, safe headers, duration, timestamp, byte count and bounded body
representation are observed data. Credential and unknown headers are redacted;
JSON string values and sensitive fields are redacted; every object key is anonymized
to field_N. Arrays/objects retain at most 100 entries and nesting is limited to eight.
Response header values are redacted except a finite normalized media-type vocabulary;
unknown header names and all content-type parameters are discarded. Plain text is withheld and
labelled, malformed JSON is withheld, binary bodies retain metadata only. Assertions
run against the bounded transient body before redaction; raw bodies are never
persisted or logged. This conservative capture deliberately sacrifices string/text
detail. SQL additionally rejects unsupported request body/header fields and
unredacted sensitive response headers. Audit contains IDs/events/actors, not content.

Assertion contracts include status equals/declared set, content type, JSON validity,
body presence/absence, basic type/property/enum and header presence. Compiler
currently emits only evidence-backed declared status sets for supported positive
cases. Negative symbolic cases receive no invented 400/401 expectation. Each
assertion retains its OpenAPI pointer. PASS/FAIL/NOT_EVALUATED are deterministic;
PASSED/FAILED concern assertions, ERROR concerns infrastructure, BLOCKED concerns
readiness/safety, CANCELLED concerns cancellation and OBSERVED covers observations
without sufficient evaluated assertions. Failure never automatically confirms a defect.

## Database worker and operations

00600 is the only new migration and remains undeployed. It adds four independently
RLS-protected tables: environment_execution_configs, execution_runs,
execution_results and execution_audit_events. A composite environment/project key
is added to existing environments without changing previous migration files or RLS.
Authenticated tables are SELECT-only; browser write RPCs derive tenant scope and
actor from auth.uid(). Private helpers have EXECUTE revoked. All privileged paths
use empty search_path, qualified static relations and trusted parents.

Runner role testpilot_runner is NOLOGIN/NOINHERIT and has only five worker RPCs,
no direct table access. An administrator must provision a dedicated short-lived
PostgREST JWT with role=testpilot_runner to the separate server runtime. Never
use a service-role key; the CLI rejects a token claiming a different role. Supabase
verifies the credential; local role inspection is configuration validation, not JWT
signature verification. This token is a database credential, not target API auth.
Configure RUNNER_SUPABASE_URL, RUNNER_SUPABASE_PUBLISHABLE_KEY and
RUNNER_DATABASE_TOKEN only in the worker secret environment; no NEXT_PUBLIC token.

Build: pnpm --filter @testpilot/api-runner... build.
Start: pnpm --filter @testpilot/api-runner start.
Worker reads its own process environment; do not copy secrets into tracked files.
No credentials are currently provisioned by the repository or this implementation.

PostgreSQL FOR UPDATE SKIP LOCKED atomically claims REQUESTED or AUTHORIZED jobs.
Each claim carries a fresh token; completion requires matching token/state and
cannot execute twice. Crashed claimed jobs stay stuck for explicit investigation;
there is intentionally no automatic lease/reclaim or mutation retry. If response
persistence fails after a send, no retry is attempted. After DNS and target preparation, await authorize_execution_send immediately before
opening the connector. It checks current claim, run state, cancellation, policy, exact
fingerprint/configuration, planning/reviews and approver membership. A successful
check records a one-shot send_authorized_at and audit event. This database snapshot
is the authorization linearization point: changes observed there prevent any socket;
changes committed after authorization cannot undo an already authorized send. Periodic
cancellation polling remains supplemental while running. Pre-send cancellation prevents sending; after-send cancellation
cannot undo the remote operation and the UI explicitly says so. A remote server
may have acted even if response capture failed. Configuration/review changes are
rechecked before claim and pre-send polling; revocation cannot undo a sent request.

## UI and deployment

/runs provides explicit target configuration, case/environment preview, request,
safety/approval/block state, cancellation, safe request/response and assertions.
Test Studio links each case to Run Test preview. No run-anyway bypass exists.
Refresh shows background worker progress; no realtime channel was introduced.
No hosted execution or real external API call was performed. Separate migration
security preflight, authorized deployment, dedicated worker credential provisioning
and legitimate hosted user/worker acceptance are required before hosted execution.
M1.8/Curiosity requires separate authorization.

## Security preflight fixes

Migration 00600 rejects an existing runner with dangerous attributes, LOGIN,
INHERIT, memberships, unexpected role assignees, object ownership, schema CREATE,
relation privileges or explicit non-runner routine grants in the deployment database.
Only authenticator may be a member. Private validators are owner-only. Built-in
PUBLIC privileges remain PostgreSQL platform privileges, not runner-specific grants;
this validation cannot inspect grants in other databases or provision credentials.

Composite keys bind reviews to their items/plans and cases to their actual scenario.
Existing M1.6 history is unchanged. Credentials in literal paths (key/value segments,
assignments, JWT/hex/high-entropy-looking values, including percent encoding) block;
semantic routes such as /auth/token and /password/reset remain supported. This is a
conservative detection policy, not a guarantee that arbitrary disguised data is
recognizable. Fingerprints recursively sort structured JSON keys and canonicalize
synthetic JSON bodies, then hash only validated request material.

SQL validates sanitized nested responses and outcome/sent/response/assertion
relationships. Success requires observations and passing evaluated assertions;
failed cases need evaluated failure; NOT_EVALUATED cannot yield PASSED. Persisted
assertions must match authorized request definitions and observed status. M1.7's
compiler emits declared-status assertions only. No raw capture is persisted.

Maintained local concurrency regression (fresh database name is required):
node tooling/verify-execution-concurrency.mjs <psql-executable> <name_m17_concurrency>
It connects only to disposable local PostgreSQL at 127.0.0.1:55433, applies local
fixtures, and proves two transactions cannot claim the same executable run.

Persisted failure codes are closed: CANCELLED, TIMEOUT, BLOCK_REQUEST_NOT_RUNNABLE,
SAFETY_BLOCKED, BLOCK_AUTHORIZATION_STALE, REQUEST_FINGERPRINT_CHANGED,
TRANSPORT_FAILURE, RESPONSE_CAPTURE_FAILURE, RESPONSE_TOO_LARGE, REDIRECT_DISABLED
and CONNECTION_TIMEOUT. Safety details remain separate validated reason codes;
exceptions are mapped to safe codes, never persisted or displayed verbatim.
UI maps codes to fixed messages. SQL enforces both vocabulary and outcome context.

Runner EXECUTE grants are limited to these exact identities:

- public.claim_test_execution()
- public.record_execution_safety(uuid,uuid,text,jsonb,jsonb,jsonb,text)
- public.finish_test_execution(uuid,uuid,jsonb)
- public.execution_cancel_requested(uuid,uuid)
- public.authorize_execution_send(uuid,uuid,text,uuid,text)

Routine validation rejects other explicitly granted identities and PUBLIC-accessible
worker-name overloads, including default arguments. Standard PostgreSQL platform
PUBLIC privileges are unchanged. No target API credential support was added.

## PostgreSQL 17 runner membership compatibility

The trusted `postgres` migration creator may receive only the automatic creator
administration grant: runner as granted role, bootstrap superuser (OID 10) as
grantor, ADMIN true, INHERIT false and SET false. This is administrator control
over the runner, not runner authority over the administrator. No other creator
members or grantors are accepted. PostgreSQL 17 records these explicit options.

PostgREST needs `authenticator` to SET ROLE to `testpilot_runner` for a reviewed
runner token. Its grant is explicit: ADMIN false, INHERIT false, SET true, with
trusted `postgres` or the bootstrap superuser as grantor. It does not inherit
runner privileges or administer membership. Roles granted to the runner remain
forbidden, as do unexpected assignees, direct table privileges and extra RPCs.

Local PostgreSQL 15 cannot reproduce PostgreSQL 17's automatic creator grant or
per-membership options. Compatibility tests execute the actual private SQL
predicate against labeled PG17 catalog-shaped fixtures and exercise real local
catalog membership rejection. Local passing results do not constitute PG17
CREATE ROLE acceptance; hosted migration dry-run/deployment remains the final
compatibility check. No hosted role changes are part of local verification.

## Hosted privilege baseline

Runner validation accepts PUBLIC SELECT only on the exact views
`extensions.pg_stat_statements` and `extensions.pg_stat_statements_info`, verified
as members of the `pg_stat_statements` extension. Ownership, explicit runner
grants, PUBLIC mutations and PUBLIC/runner column grants invalidate the exception.
No extensions schema USAGE is granted. All other non-system relation privileges,
column privileges and sequence USAGE/SELECT/UPDATE remain forbidden. PostgreSQL
17 MAINTAIN is separately checked behind a server-version guard.

Schema USAGE is limited to public plus ordinary pg_catalog/information_schema
visibility; persistent schema CREATE and ownership are forbidden. Database CONNECT
and PUBLIC TEMPORARY are accepted platform baseline. Temporary objects do not
provide persistent TestPilot authority: RPCs use empty search paths and qualified
relations. Database CREATE/ownership are rejected across databases.

Every M1.7 function has deliberate EXECUTE access: authenticated user RPCs only
to authenticated, worker RPCs only to testpilot_runner, and internal helpers only
to their owner. PUBLIC/anon/service_role defaults are explicitly removed; runner
and authenticated defaults are removed where inappropriate. Platform defaults
and earlier migrations are not modified.

For local database verification, apply `supabase/tests/postgres-bootstrap.sql`
to a fresh disposable database, then create schema extensions and install
pg_stat_statements there before applying migrations and running the six suites.
The bootstrap models service_role function EXECUTE defaults. The extension views
are used for real catalog/ACL tests without querying runtime statistics. Local
PostgreSQL 15 cannot exercise actual MAINTAIN grants; version-aware SQL assertions
execute those cases on PostgreSQL 17. Hosted deployment remains the final PG17
compatibility check.
