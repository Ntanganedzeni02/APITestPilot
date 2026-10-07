# M1.6 verification record

Initial HEAD: f25673f, feat: add requirements and risk intelligence. Initial
working tree was clean. M1.2-M1.6 hosted migrations are deployed according to supplied authoritative
authenticated CLI evidence. The user deployed 00500 after its successful security
re-preflight. This verification performed no staging, commit, hosted schema/data
write, real signup or execution engine work.

## Implementation and policy

Existing domain, test-engine, ai, database and web boundaries were extended; no
external dependency or provider SDK added. Workspace links were installed offline
without lifecycle scripts. The planning model pins exact analysis/source IDs and
requirement review versions. Scenario/case originals are immutable; human additions,
independent append-only reviews and audit remain distinguishable. All deterministic
items link requirements, risks where relevant, graph refs and source pointers.
See [design, taxonomy, rules, queries and limits](test-planning.md) and
[ADR 0009](../adr/0009-immutable-test-planning.md).

Approved requirements can support candidate executable deterministic planning;
proposed deterministic requirements yield drafts, rejected requirements are excluded,
updated/AI/human prose remains review-only. Scenario approval does not approve cases.
Cases require their own approval, approved scenario and approved pinned requirements;
setup remains blocking. Planning eligibility never authorizes API execution.

## Quality gates and regression

Repository-local Node 24.21.0 / pnpm 12.9.1 used throughout. Lint, complete tests,
workspace typecheck, formatting, production build and Git diff check pass.
Final test count: 240 tests in 27 files (179 prior + 53 planning/AI/domain +
6 database adapter + 2 presentation tests). Focused planning coverage includes stable
keys/ordering, scope and parent links, review/eligibility, explicit boundaries,
exclusive/zero-length boundary non-inference, state-value non-transitions, priority,
coverage/RTM, AI validation/ref/status/result injection/oversize/timeout/rate-limit/
unavailable failure isolation and excluded prompt-injection/credential-like text.
Mocked AI tests are not network/provider evidence.

An existing ESLint boundary test initially timed out while compilation was running;
a subsequent complete run without competing compilation passed. No timeout or test
expectation was weakened. Local SQL development caught expression precedence and
an independent-FK assertion initially masked by uniqueness; both were corrected
before the final successful verification.

## Local PostgreSQL persistence/security

Final migration applied only to fresh disposable PostgreSQL 15 database
testpilot_m16_acceptance at loopback 55433, using the ignored local cluster.
Order: compatibility bootstrap, migrations 00100-00500. All suites rolled back:

| Suite                  | Assertions |
| ---------------------- | ---------: |
| M1.2 tenancy           |         46 |
| M1.3 API knowledge     |         22 |
| M1.4 Behaviour Graph   |         44 |
| M1.5 requirements/risk |         87 |
| M1.6 test planning     |        105 |

M1.6 checks physical snapshot versioning, complete scenario/case/evidence/audit
persistence, forged scope and approval rejection, requirement review/text/version
pinning, stale-source rejection, cross-analysis QA links, graph/source refs,
atomic late failures without residue, raw generated/review bounds, independent
review, MEMBER permissions, OWNER/ADMIN review, immutable originals, human-origin
restrictions, eight-table RLS/direct DML denial, anonymous/private helper EXECUTE
restrictions, safe SECURITY DEFINER paths and independent composite FKs.
These are actual PostgreSQL transactions/privileges using disposable Auth claims,
not hosted Supabase JWT issuance or PostgREST acceptance. Bootstrap must never run
against hosted Supabase. Previous migrations are unchanged.

## Browser and normal startup

Desktop 1440x900 and mobile 390x844 acceptance used a clearly labelled loopback
fixture at port 4400 with production PlanningView/PlanningActionForm, real parser,
graph/QA/planning engine and real local database adapters/RPCs. Only fixture actions
replace Next/PostgREST transport; emulated claims are confined to local PostgreSQL.
The earlier fixture used the pre-blocker-fix local migration. Empty state, forced generation
failure/zero partial plan, deterministic generation/AI unavailable, source/summary,
scenario and case details, independent approve/reject/edit/history, case filtering,
coverage gaps, RTM, keyboard regeneration/versioning, manual scenario/case additions,
origin filtering, mobile overflow and runtime-error checks passed. No full runtime
API test or fake hosted acceptance occurred. The final zero-minimum rule correction
was additionally unit-tested; it does not change this fixture's declared constraints.

Normal pnpm --filter @testpilot/web dev --port 3000 started the actual app at
http://127.0.0.1:3000. Signed-out /tests, /requirements and /risks returned 307 to
login; /login and /signup returned 200. No real user, recovery or hosted analysis
write was performed. Hosted authenticated test planning: DEFERRED - authentication
acceptance dependency. No already-authenticated legitimate agent session was
available; no auth workaround or service role was used. No real AI call is required.

## Security, limitations and next steps

Final changed files were reviewed for secret/debug patterns, generated/temporary
artifacts, NUL corruption, unrelated scope and prior migration modifications.
No findings; verification harnesses/databases remain ignored under .tools. Only
20261006000500_test_planning.sql is new. Nothing is staged or committed.

Known limits: no hosted planning acceptance, configured real provider or execution
DSL; opaque AI context limits business reasoning; normalized component-based schema
rules are conservative; manual proposals use an existing scenario template; lists
show 50 items and latest 10 plans; reconstruction refuses histories above 10000 rows
instead of silently truncating. Preconditions are never treated as satisfied.
Semantic truth of stored free prose is not attested by SQL. Future execution needs
separate compilation and Safety authorization. The migration security re-preflight and user-authorized deployment are complete.
Hosted planning/review/tenant acceptance remains a separate authentication dependency. Do not begin M1.7 without authorization.

## Three-blocker fix verification

The 00500 migration, fixed before deployment, independently enforces pinned requirement
source/status/edit-history eligibility, separates planner HUMAN_SOURCE from manual
HUMAN derivation and validates identifier references against scoped dependency
edges and operation endpoints. No prior migration or hosted database was changed.

Focused tests: 61 across 3 files. Complete tests: 240 across 27 files. Disposable
PostgreSQL assertions: 46 / 22 / 44 / 87 / 105. Direct authenticated RPC regressions
cover AI/human laundering, proposed/rejected/edited executable bypass, legitimate
approved deterministic planning, mixed human-source plans, null/invented/wrong-type/
cross-graph/project/tenant dependencies and preserved raw payload bounds.

Actual local generator -> adapter -> SQL RPC verification covers approved
deterministic dependency planning, mixed proposed/approved/edited human requirements,
non-executable HUMAN_SOURCE provenance and atomic failure. No hosted Auth was bypassed.
Desktop/mobile fixture acceptance above records the earlier implementation run;
it was not repeated for this focused blocker fix. Hosted M1.6 deployment is now confirmed by supplied evidence; browser
authenticated planning acceptance remains deferred. Planning eligibility authorizes no HTTP.

## Final post-deployment verification

Supplied authenticated CLI evidence confirms local/remote migration IDs 00100
through 00500 match, with 20261006000500_test_planning.sql successfully deployed.
Remote history was not queried and no hosted data/schema was changed.

Lint, typecheck, complete tests (240 across 27 files), format check, production
build and git diff --check pass. One initial parallel gate run timed out in the
existing five-second ESLint boundary test; the complete suite passed when rerun
without competing lint/typecheck gates. No test timeout or implementation was changed.

Fresh disposable local PostgreSQL assertions pass at 46 / 22 / 44 / 87 / 105. An
initial run against the retained integration-fixture database hit a global table-count
assertion; a fresh local database isolated regression data and all suites passed.

Normal development startup on 127.0.0.1:3000 succeeds. Signed-out /tests redirects
307 to /login; /login and /signup return 200. A focused labelled fixture using actual
production planning components and the final local database schema renders summary,
scenarios, cases, coverage and traceability without runtime exceptions or console
errors. This was a smoke check, not a repeat of the complete browser acceptance suite.

Hosted authenticated test planning: DEFERRED - authentication acceptance dependency.
No legitimate already-authenticated session was available in the verification context.
No real AI provider call is required; deterministic planning and failure fallback
remain covered by passing tests. No service-role or hosted authentication workaround
was used. Planning remains separate from future Safety authorization and execution.
