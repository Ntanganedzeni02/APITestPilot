# M1.5 verification record

Date: 2026-10-07 (work began 2026-10-06). Initial tree clean at `74c802f`,
`feat: add deterministic API behaviour graph`. No staging, commits, hosted
migration changes, real model calls or M1.6 work.

## Local quality gates

Repository-local Node 24.21.0 / pnpm 12.9.1:

| Check            | Result                                              |
| ---------------- | --------------------------------------------------- |
| Lint             | PASS, zero warnings                                 |
| Typecheck        | PASS, all workspaces                                |
| Full test suite  | PASS, 179 tests in 24 files                         |
| Format check     | PASS                                                |
| Production build | PASS, protected Requirements/Risks routes generated |
| Git diff check   | PASS                                                |

The baseline was 124 tests. M1.5 adds 41 engine/AI/domain/query tests,
10 persistence adapter tests and 4 presentation tests. Fixtures exercise all
8 requirement and 8 risk rules; stable ordering/deduplication and logical IDs;
resolved source and graph evidence; exact-source mismatch rejection; conservative
security/enum/CRUD/dependency handling; negative over-inference; review state
and role policy; provider absence, valid mocked output, strict malformed/oversized/
unknown-field/category/evidence/ownership/approval rejection, timeout, rate limiting
and failure isolation. Imported malicious descriptions do not reach the provider.
Persistence tests check scope, paged reconstruction, missing/malformed rows,
immutable source arguments, human-origin constraints and stale-review conflicts.
Presentation tests check truthful summaries, separate AI failure and escaped text.
Mocked provider/transport tests are not hosted network evidence.

## Real local PostgreSQL assertions

The final migration was applied from scratch only to fresh disposable PostgreSQL
15 database `testpilot_m15_edit_fix`, loopback port 55433, using the existing
ignored `.tools/m13-postgres` cluster. Order: compatibility bootstrap, M1.2,
M1.3, M1.4, M1.5. Results:

| Suite                           | Assertions |
| ------------------------------- | ---------: |
| M1.2 tenancy regression         |         46 |
| M1.3 API knowledge regression   |         22 |
| M1.4 Behaviour Graph regression |         44 |
| M1.5 intelligence/security      |         87 |

All suites completed their assertion count and ROLLBACK. M1.5 checks distinct
analysis snapshots, complete items/evidence/requirement links, caller-derived
actors, creation/review/manual-add audits, failed saves without partial rows or
audit residue, invalid source pointers/nodes/edges/structured text,
mandatory validated AI metadata, cross-project and cross-tenant rejection, stale
review protection, MEMBER edit/add permissions and denied approval/rejection,
preserved generated originals, immutable records, independent graph/analysis
foreign keys, all-table read RLS/direct-write denial, anonymous/no-caller restrictions,
private helper ACLs and empty SECURITY DEFINER search_path.

These are actual PostgreSQL privilege/RLS/transaction checks using emulated Auth
claims, not Supabase JWT issuance, PostgREST or hosted Auth verification. The local
bootstrap must never run against Supabase. Previous migration files are unchanged.
Only the new M1.5 migration was created. No hosted schema or data was modified.

## Browser and normal application startup

An isolated headless Chrome profile exercised a clearly labelled local fixture at
loopback 4400. It used production QaActionForm and IntelligenceView, the real parser,
Behaviour Graph builder, intelligence engine, database adapter and creation/review/
manual-add PostgreSQL RPCs. The transport substitutes a loopback fixture action
and local SQL-backed client for Next actions/PostgREST; Auth claims are emulated
against disposable users. It uses no service-role key or hosted fake JWT.

Final desktop 1440x900 and mobile 390x844 checks passed: initial empty state,
visible forced foreign-key failure with zero partial analysis, real deterministic
analysis persistence, separate unconfigured AI status, exact import/graph/version
summary, requirement/risk details and provenance, owner approval/rejection, edit
resetting approval while preserving the original, append-only review history,
manual requirement/risk addition, source filtering, severity distribution,
keyboard-triggered re-analysis with a distinct snapshot, focus navigation,
no horizontal overflow and no observed blocking browser runtime/console errors.
The safe development API fixture generates 120 proposals before human additions.
Earlier harness-only wait/count/pagination assertions were corrected; the final
complete browser run passed against the final compiled engine/adapter. This is
labelled local component/persistence acceptance, not authenticated hosted acceptance.

The normal command `pnpm --filter @testpilot/web dev --port 3000` started the
actual Next application at `http://127.0.0.1:3000`. Signed-out Requirements,
Risks and API Map returned 307 to login. Login/signup returned 200 and the
signup form loaded. No real signup, recovery or hosted application write occurred.
Verification servers and the disposable PostgreSQL cluster were stopped afterward;
ignored local fixture databases/scripts/browser profile remain for diagnosis.

## Deployment, security and remaining work

M1.2/M1.3/M1.4/M1.5 deployment is known from the supplied authenticated migration
status evidence: local and remote versions 20261006000100 through 20261006000400
match. The corrected M1.5 migration was successfully applied by the user. Hosted
authenticated analysis is DEFERRED — authentication acceptance dependency.
No authentication workaround, inbox access or confirmation bypass was attempted.
This deferred hosted check does not block deterministic/local milestone acceptance.

The changed/new source diff was inspected for secret patterns (values suppressed),
NUL-byte corruption, debug logging, generated artifacts, unrelated changes and
M1.6 functionality. No findings remained; generated tools/build outputs are ignored,
staged files remain empty and prior migrations are unchanged. Two files found corrupted
during a sandbox failure were restored from their original Git content
and the intended changes reapplied; subsequent compilation and source checks passed.

Known limits: no real AI provider integration; opaque type-only AI context limits
semantic business reasoning; structured validation establishes shape/scope rather
than proving AI prose true; human review remains mandatory. Direct component rules
and explicit graph associations are intentionally conservative. Current selectors
show 50 imports/10 analyses and proposal lists page 50 items; older immutable data
is preserved. Human risks can have no requirement link. Local PostgreSQL 15 checks
do not substitute for hosted Supabase/Auth/PostgREST acceptance. Before M1.6,
complete legitimate hosted
analysis/review/tenant acceptance; do not start M1.6 without authorization.

See [design and limits](qa-intelligence.md) and
[ADR 0008](../adr/0008-requirements-risk-intelligence.md).

## Edit payload security correction

The migration preflight found a blocking raw-storage bypass: checks measured
`btrim` content while the review RPC stored untrimmed input. Direct authenticated
callers could persist oversized space-padded edits. The then-undeployed M1.5 migration
now checks raw lengths before trimming, bounds total RPC text to 32 KiB and stores
normalized edits (policy A). Table checks independently enforce raw bounds and
canonical storage; rationale remains bounded. No previous migration, permissions
or application length limits changed.

Direct SQL tests cover leading/trailing padding for REQUIREMENT and RISK titles
and statements, just-over-limit and million-character inputs, empty trimmed
content, oversized rationale/total payload, accepted inclusive limits, normalized
valid edits, failed-edit atomicity, immutable originals and per-review audits.
OWNER/ADMIN approval/rejection and edits remain supported; MEMBER edits remain
allowed and MEMBER approvals/rejections denied. Existing tenant/stale-review/RLS
regressions remain passing. The table bounds are also tested independently of RPC.

The focused 55 tests and complete 179 tests pass; local database counts are
46/22/44/87. Lint, typecheck, format check, production build and diff check were
rerun for this fix. Earlier browser evidence above was not rerun. The blocking
edit-payload defect was resolved locally and the targeted re-preflight passed.
The user subsequently deployed the corrected migration successfully. Nothing was staged or committed.
