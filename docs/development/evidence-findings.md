# Evidence and findings (M1.8)

Evidence proves; AI interprets; humans decide. This milestone derives from existing
M1.7 persisted execution results without adding runner capabilities or HTTP calls.

## Model and derivation

`derive_execution_evidence(run_input)` takes only a persisted run UUID. It checks
authentication and workspace membership, locks the persisted result, requires a
terminal run and independently revalidates the bounded/redacted result. It creates
one evidence package per run, typed item references and deterministic candidates
in one transaction. A failed derivation leaves the execution/result untouched and
leaves no partial package, occurrence, finding or audit history. Runs exposes an
explicit derive action; no autonomous processing or follow-up execution is added.

Packages bind workspace/project/environment/configuration version/plan/scenario/
case/run/result through composite foreign keys. Source review IDs, safe authorized
request, request fingerprint, safety decision/facts, full tenant/test scope, bounded result and completion timestamp contribute
to a version-1 SHA-256 manifest. PostgreSQL canonical `jsonb::text` is the hash
encoding. Completion timestamps use `YYYY-MM-DDTHH:MI:SS.ffffffZ`, explicitly
normalized to UTC before formatting; session timezone does not affect the hash.
Arrays preserve their source order and nulls remain JSON null. Package IDs, hashes and typed references do not duplicate full payloads.
The item taxonomy is REQUEST_SUMMARY, RESPONSE_SUMMARY, ASSERTION_RESULT, TIMING,
EXECUTION_FAILURE and SAFETY_DECISION; assertion items use zero-based indexes.
Existing immutable run/source references resolve request, response, assertions,
safety facts and timings. Historical packages/items/occurrences/reviews cannot be
written directly by authenticated users. No raw response or new secret capture
is introduced. Finding detail uses only the existing safe/redacted representation.

## Identity, classifications and human authority

A logical finding has closed severity INFO/LOW/MEDIUM/HIGH/CRITICAL, confidence
LOW/MEDIUM/HIGH, deterministic source, rule and CANDIDATE/CONFIRMED/DISMISSED status.
Failed persisted assertions yield MEDIUM/HIGH-confidence candidates. TIMEOUT and
CONNECTION_TIMEOUT yield INFO/MEDIUM-confidence infrastructure observations;
TRANSPORT_FAILURE yields INFO/LOW-confidence observations. These do not establish
API defects. Successful runs, cancellations, safety blocks, stale authorization
and other system outcomes produce evidence but no automatic finding.

The logical signature hashes project, environment, immutable case, authorized
request fingerprint, rule and assertion definition/failure category. Assertion
status/actual/reason are excluded from assertion identity. Distinct definitions
or execution contexts do not collapse; repeated observations attach unique
(finding, package) occurrences. Each keeps its own source result and evidence.
Counts and first/latest timestamps update atomically. Existing severity, review
revision and confirmed/dismissed decisions remain unchanged on repeat observation.
Result locks, unique constraints and row locks protect retry/concurrent derivation.

Workspace members explicitly confirm or dismiss a candidate and may set effective
severity. A revision check and row lock reject stale/concurrent or already-reviewed
actions. Each review appends actor, time, old/new status and severity and a bounded
note (1,000 characters). Do not enter credentials or sensitive personal information
in notes. Supported recognizable credential patterns are rejected before any
review, state or audit write: authorization/bearer forms, credential-bearing URLs,
API/token/password assignments, JWT/private-key markers and Supabase secret keys.
This is not universal detection of arbitrary secrets. The domain detector and
SQL predicate share a regression-checked pattern. Review history is never overwritten.
Requirement/risk references resolve the case's existing immutable QA links rather
than copy text. Review decisions are not release decisions.

Audit events are EVIDENCE_DERIVED, FINDING_CREATED, FINDING_OBSERVED_AGAIN,
FINDING_CONFIRMED, FINDING_DISMISSED and FINDING_SEVERITY_CHANGED. They store scoped
IDs, actor and time, with no arbitrary payload. Confirming an infrastructure
observation still requires human interpretation of the evidence.

## Authorization and AI boundary

All six new tables have member-scoped read RLS. No ordinary direct mutations are
granted. Only authenticated callers receive the two controlled RPCs, which use
empty search paths and qualified relations. Existing runner authority remains
exactly five M1.7 RPCs. Service-role credentials are not used for application flows.
Browser workspace/project values never establish authorization; server context
checks and database membership/composite bindings independently protect access.

The framework-independent interpretation provider contract receives opaque bounded
item references. A strict structured validator accepts cited existing IDs, title,
summary and proposed severity/confidence only. Unsupported IDs, extra authority
fields and oversized proposals are rejected. Effective severity and status remain
human-owned. No provider invocation, AI persistence, AI confirmation, arbitrary
execution, fabricated result or follow-up test generation is implemented.

## UI, performance and verification

Findings provides status filtering and 25-row pages, details with 20-occurrence
pages, operation/source/result links, redacted evidence and human review/history.
Runs batches evidence/findings links. Reads use deterministic bounded pagination;
limits fail closed instead of silently dropping data. No per-occurrence queries
are used. Loading/error/empty states do not imply successful analysis or absence
of defects. Review success is shown only after RPC acceptance.

For local SQL verification use a fresh disposable database with the bootstrap and
extension setup documented in [safe execution](safe-execution.md), apply migrations
00100?00700 **locally only**, then run `supabase/tests/evidence-findings.sql` and all
six earlier suites using `psql -v ON_ERROR_STOP=1`. SQL fixtures use actual controlled
RPCs and labeled synthetic execution payloads; no external HTTP is sent. Tests roll
back their data. Domain/UI/adapter/action tests are deterministic fixtures, not
hosted network acceptance. Run repository lint, typecheck, test, format:check and
build with Node 24 / pnpm 12.9.1.

M1.8 Evidence + Findings is deployed to hosted Supabase via
`20261007000700_evidence_findings.sql`. Local and hosted migration histories are
aligned through 00700, and final hosted M1.8 verification passed. Prior migrations
00100 through 00600 remain unchanged. Legitimate authenticated browser acceptance
remains a separate deferred check. Actual AI provider interpretation remains
intentionally deferred. M1.9 adds local bounded investigation integration; its
migration is not deployed (see [Curiosity Engine](curiosity-engine.md)). Release scoring and
long-term memory remain deferred.

### Maintained concurrency regression

Run with repository Node 24, the local PostgreSQL cluster on 127.0.0.1:55433 and
an unused disposable database name ending in `_m18_concurrency`:

```powershell
node tooling/verify-evidence-concurrency.mjs "C:/Program Files/PostgreSQL/15/bin/psql.exe" testpilot_review_m18_concurrency
```

The harness refuses remote hosts, creates a fresh disposable database, applies
bootstrap/migrations locally and seeds labeled synthetic persisted execution data.
It uses two independent backends and verifies an actual lock wait before releasing
the first transaction. It checks duplicate-free derivation and a single accepted
competing review, including evidence, counts, timestamps and audit integrity.
No external HTTP is sent. Fixture data stays only in that disposable local database.
