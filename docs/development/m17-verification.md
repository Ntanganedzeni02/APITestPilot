# M1.7 verification evidence

Initial HEAD: `d234dc1` (M1.6); working tree was clean. M1.7 remains unstaged
and uncommitted. Migration `20261006000600_safe_execution.sql` is local only;
previous migration files are unchanged. No hosted database or schema was modified.

## Deterministic and local verification

- Complete suite: 428 tests across 31 files, passing (baseline: 240).
- Local PostgreSQL 15, fresh disposable database, all six migrations applied:
  M1.2 46, M1.3 22, M1.4 44, M1.5 87, M1.6 105, M1.7 117 assertions pass.
- Two concurrent PostgreSQL transactions: one claims and holds a job; the second
  skips its locked row and returns no job. Duplicate claims and mismatched completion
  tokens are separately covered by the SQL regression suite.
- Controlled loopback HTTP tests cover actual transport, bounds, timeout, redirects,
  cancellation, response redaction, deterministic assertions and approval gating.
  Test-only injected transport permits controlled fixtures; production transport
  always validates DNS and pins the validated address. No public API was exercised.
- Previous implementation acceptance (before these targeted security fixes):
  desktop 1440px and mobile 390px fixture acceptance passed: preview, safe execution,
  actual observation/assertions, redaction, pending approval, approval completion,
  unsafe-target blocking, keyboard focus, no overflow and no browser runtime errors.
  This uses real application components, repositories, local SQL RPCs and worker;
  authentication and local target routing are explicitly fixture-only transports.
- Normal development command starts Next.js at http://127.0.0.1:3000.
  Signup/login return 200; signed-out Runs/API Map return 307 to /login.

Hosted authenticated execution is DEFERRED. Local fixture acceptance does not
establish hosted user authentication, dedicated worker credential provisioning,
PostgREST role configuration or hosted execution. No real user was created.

## Final quality and Git review

Lint, complete workspace typecheck, formatting check and production build pass
using repository-local Node 24.21.0 and pnpm 12.9.1. The production build includes
/runs. git diff --check passes; changed-file token/private-key pattern scan found
no credentials. Execution sources contain no debug logging, dynamic code execution
or shell invocation. Only the worker performs target HTTP. No generated or temporary
verification files appear in Git status. Final state: 24 modified tracked files,
19 untracked files, no staged files. Application and fixture servers were stopped.

## Deployment boundary and limitations

A separate migration security preflight and authorized deployment are required.
Provision a short-lived dedicated `testpilot_runner` database token through a
reviewed administrator process; never use service role. Verify legitimate hosted
execution after that provisioning and migration deployment. M1.8 is not authorized.

Target API authentication, path/dependency identifiers and automatic setup are
unsupported and block execution. JSON body materialization supports only bounded
synthetic primitive inputs and small flat objects; complex inputs remain blocked.
No automatic retry, lease recovery or mutation replay exists. A crashed claim needs
explicit investigation. Cancellation cannot undo a sent operation. Text bodies are
withheld and JSON string values redacted; observations deliberately minimize data.

The runner is trusted executable code with narrow cross-tenant worker RPC access;
its database credential must stay server-only. AI cannot authorize or send requests.
Failure does not confirm a defect, and no Curiosity/findings/release engine exists.

## Targeted security-fix verification

The prior preflight was BLOCKED. These fixes require a new read-only security
re-preflight; previous acceptance alone does not establish deployment safety.
Focused regressions cover header values/media metadata, anonymized nested JSON
keys/arrays, credential literal paths versus semantic routes, canonical request
fingerprints and fail-closed final authorization during DNS preparation. Actual
controlled HTTP capture verifies hostile response markers do not survive result
serialization. SQL tests exercise role attributes/memberships/privileges, review
FK substitution, current final-send bindings, isolated configuration/review/cancel/
approver revocations, contradictory outcomes and nested sensitive payloads. Safe
results persist through real runner RPCs, while assertion substitutions are rejected.
The maintained concurrency script passes against the final schema with two real
transactions. No hosted or real external API requests were made.

Final controlled orchestration also passes through the actual built worker, real
local SQL RPCs and explicitly injected loopback HTTP: safe read completion with
sanitized persistence, exact production approval plus final-send authorization,
and private-target blocking without response evidence. The local fixture server
was stopped afterward. This is local integration evidence, not hosted acceptance.

## Final two-finding fix verification

The remaining free-form failure channel is replaced by eleven domain-owned codes,
independently checked by SQL and constrained to valid outcome contexts. Unknown
codes, credential-like strings, raw/lowercase messages and oversized values are
rejected through actual finish RPC calls. Each legitimate code succeeds through
the real RPC in its valid context. UI presentation uses a closed message mapping
with a generic fallback. Safety readiness/reasons are normalized to fixed codes;
safety facts derive trusted environment/method/target and reject error/message
substitute fields. Audit continues to contain closed events and IDs only.

Runner routine validation uses schema-qualified regprocedure identities (including
all argument types), with NULL-safe comparison before routines exist. Real catalog
tests reject text/integer overloads, unexpected schemas, extra explicit grants and
default PUBLIC execution of worker-name overloads. Role attributes/memberships and
relation checks remain intact. Final local suites pass 46/22/44/87/105/117 assertions.
The maintained concurrent claim regression passes against this migration. Full
tests pass 428 across 31 files. A final read-only security re-check remains required;
no hosted deployment or credentials were provisioned.

## PostgreSQL 17 creator-membership compatibility fix

The failed hosted 00600 deployment rolled back; read-only diagnosis confirmed
00100?00500 remain recorded, with no hosted runner role or M1.7 execution tables.
Hosted PostgreSQL is 17.11, `postgres` is a non-superuser CREATEROLE role, and
bootstrap superuser OID 10 is `supabase_admin`. PostgreSQL 17 source confirms
implicit creator membership uses ADMIN true, INHERIT false, SET false and that
bootstrap grantor. The undeployed migration now recognizes only this constrained
trusted `postgres` relationship and explicitly sets authenticator options to
ADMIN false, INHERIT false, SET true. All prior privilege guards remain intact.

Local PostgreSQL 15 regression passes 46/22/44/87/105/134 assertions, including
17 new compatibility checks. PG17-shaped fixture rows exercise the same private
SQL predicate used by the catalog validator; real catalog tests additionally
check authenticator acceptance, unexpected ADMIN recipients and unsafe transitive
membership. These fixtures do not reproduce actual PostgreSQL 17 CREATE ROLE.
Hosted dry-run/deployment remains the final PG17 compatibility check. No hosted
role modifications or deployment were performed for this fix.

After this compatibility fix, all 428 tests across 31 files, lint, typecheck,
repository format check, production build and `git diff --check` pass. Earlier
migrations remain unchanged, 00700 is absent, and no files were staged or committed.

## Final hosted ACL validator hardening

00600 remains undeployed after the second failed transaction. Only the two exact
pg_stat_statements extension views' PUBLIC SELECT baseline is permitted, with
extension membership, view kind, ownership, source ACL and column checks. Real
local extension objects exercise acceptance and rejection; no simulated extension
membership is used. Supabase-like service_role EXECUTE defaults are seeded before
migrations, then deliberate M1.7 function access is verified. Sequence, column,
schema and database checks are exercised through real local grants. MAINTAIN
validation and grant tests are PostgreSQL-17-gated; PostgreSQL 15 reports those
two grant cases deferred rather than passing.

All six local DB suites pass 46/22/44/87/105/162 assertions in the extension/default
ACL fixture. PG17 creator membership and closed failure-code regressions remain
passing. No hosted privileges, roles or schema were modified for this hardening.

Final system-object checks reject explicit runner grants even where ordinary
PUBLIC catalog visibility exists. Real pg_class and version() grants exercise
that boundary; no broad PUBLIC mutation exemption was introduced.

Final hardening quality gates pass: 428 tests across 31 files, lint, typecheck,
full format check, production build and git diff --check. Git contains 25 modified
tracked entries and 17 untracked entries, with no staged files. Changes for this
pass are limited to 00600, the SQL suite/bootstrap fixture and two development
documents. Earlier migrations remain unchanged; 00700 is absent. No credentials
or generated verification artifacts are included in those changes.
