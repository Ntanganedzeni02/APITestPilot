# M1.11 Release Intelligence + Reports

TestPilot assesses. Evidence supports. Humans decide. M1.11 is implemented and deployed; migration `20261007001000_release_intelligence_reports.sql` is **deployed**. Local/remote migrations align through 01000. Hosted catalog/function verification passed with no blocking defects. M1.10 / 00900 is deployed and hosted verification passed. M1.12 hardening is in progress; 01100 is deployed and local/remote migrations align through 01100. No AI provider, API execution, deployment orchestration or release automation is added.

## Scope and lifecycle

A human OWNER/ADMIN creates a release with a bounded safe name/version. The server binds the current immutable API import, existing project/workspace and selected logical environment. Import UUID is the source/version identity; no code-diff impact is inferred and untrusted specification labels are not copied into reports. No duplicate project/environment/source model exists.

DRAFT means no assessment pointer. ASSESSED means an assessment exists without a decision for that exact assessment. DECIDED means the current decision references the current assessment. Reassessment keeps earlier decisions as history, never approval for different evidence. Source replacement labels old release scope historical; reassessment has SOURCE_SUPERSEDED / NO_CURRENT_QUALITY unknowns, while historical reports remain readable.

## Deterministic policy: release-policy-v1

Precedence is **BLOCKED > INSUFFICIENT_EVIDENCE > CAUTION > CLEAR**. These describe evidence, not human decisions or execution authorization. Every signal contains a closed reason code and scoped UUID/hash references. Duplicate finding occurrences do not multiply blockers.

| Signal                                                            | Classification                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| CONFIRMED HIGH/CRITICAL finding in the exact environment/import   | Blocker                                               |
| Current asserted FAIL linked to an approved HIGH/CRITICAL risk    | Blocker                                               |
| CONFIRMED MEDIUM finding                                          | Warning                                               |
| CANDIDATE HIGH/CRITICAL finding                                   | Warning, never confirmed                              |
| Current failed requirement or LOW/MEDIUM risk evidence            | Warning                                               |
| Latest eligible assertion failure / infrastructure error          | Warning; infrastructure error never confirms a defect |
| Asserted evidence aged 8-30 UTC days                              | Warning                                               |
| INCONCLUSIVE / STOPPED_BY_POLICY / BUDGET_EXHAUSTED investigation | Warning, never a proven defect                        |
| Current failure memory with more than one observation             | Warning, never blocker                                |
| Known non-null quality dimension below 80                         | Warning                                               |
| Uncovered requirement/risk (HIGH/CRITICAL distinguished)          | Unknown                                               |
| Untested operation / unasserted or >30-day evidence               | Unknown                                               |
| OPEN / WAITING_FOR_APPROVAL / RUNNING investigation               | Unknown                                               |
| Old source, missing compatible quality or inadequate sufficiency  | Unknown                                               |

CLEAR requires no blockers, warnings or unknowns, a non-null quality overall, at least 80% M1.10 sufficiency and confidence above LOW. A high score with narrow evidence cannot make CLEAR. DISMISSED findings never penalize or block. INFO/LOW confirmed findings and lower candidate findings remain visible context without an automatic warning.

## Authoritative inputs and reproduction

Assessment refresh reuses `assess_project_quality`, not duplicated quality formulas. Its compatible immutable `api-quality-v1` snapshot supplies exact dimensions, requirements coverage, severity-weighted risk coverage, gap IDs, sufficiency, confidence and evidence provenance. A single statement collects release inputs and checks the referenced quality inputs still equal `intelligence_inputs`; up to three attempts handle concurrent source changes, otherwise the transaction fails for retry.

Only existing persisted evidence packages count. M1.11 does not invent missing packages or mutate finding/investigation authority. Derive evidence through existing Runs/Memory workflows first. Missing packaged/asserted evidence stays unverified.

Latest eligible execution per operation distinguishes PASS, FAIL and ERROR; blocked/cancelled/unasserted executions do not erase asserted evidence. Risk/requirement failure uses the latest asserted observation, within 30 UTC days, with current APPROVE review causally preceding execution, the current analysis/planning relationship, and exact frozen approved unedited requirement-review version where required. An infrastructure error does not erase an earlier unresolved asserted risk failure. A later asserted success replaces that failure. Coverage measures assertion evidence, not successful behavior; covered evidence can FAIL.

Findings retain human state, severity, revision, occurrence count, review IDs and original package/case references. Investigations retain closed status/conclusion, revision, source/conclusion packages and audit references. Memory retains safe fact IDs, state/count and observation/run/package IDs; only the release environment/import contributes. Superseded memory is context and cannot override current successful evidence. No operation names, QA prose, finding notes, headers, request/response bodies, AI output or hidden reasoning enter assessment/report content.

To reproduce: collect these scoped inputs, reuse the stored M1.10 snapshot, apply each table condition, collect blocker/warning/unknown arrays, then apply the stated precedence. Domain and SQL policy implementations have maintained parity vectors. No model chooses thresholds.

## Identity, time and concurrency

Assessment fingerprint hashes release ID, workspace/project/environment/import, policy version and the complete structured authoritative input. Included quality identity/state, current reviews/findings, coverage, eligible evidence, investigations and memory make relevant changes create/reuse a distinct snapshot. Source-currentness and RECENT/AGING/STALE bands account for clock passage without row mutation. Freshness is M1.10's 0-7 days=100, 8-30=50, >30=0, clamped for future timestamps; UTC dates and UTC serialization avoid session-timezone identity drift.

Historical assessments never update. Membership -> project -> release is the common lock order. Unique `(release_id,fingerprint)` independently protects idempotency. OWNER/ADMIN refresh may update only the current pointer. Independent-session tests prove real lock waits and one logical assessment, not merely UI double-click prevention.

## Human decision

OWNER/ADMIN may record APPROVE, APPROVE_WITH_RISK or REJECT; MEMBER reads only. Actor/time come from auth/database, never browser fields. APPROVE requires CLEAR. For every other assessment, an accepting human must explicitly choose APPROVE_WITH_RISK and supply a safe nonempty <=1000-character rationale. REJECT also requires a rationale; CLEAR approval may omit one. Risk approval is visibly marked an override when the assessment is non-CLEAR. It never rewrites the assessment.

Decisions are append-only with increasing release revision and a current pointer. Clients submit the exact assessment and expected decision ID. The server locks, rechecks both pointers and reassesses current state before accepting; stale/concurrent decisions fail with 40001. Replacing a decision preserves all prior history. This system does not deploy, approve execution or assert a release is safe merely because a human accepts risk.

## Immutable reports: release-report-v1

Official report generation is OWNER/ADMIN controlled; members may read/download. The server takes only release/assessment selectors, chooses the latest human decision for that exact assessment (or null), and freezes release identity/scope, environment enum, the complete immutable assessment/quality snapshot and exact decision actor/time/rationale. Report metadata preserves generation actor/time. The report never queries today's findings/quality to recalculate its historical content.

Uniqueness across release/assessment/decision/report version treats null decisions as equal. Different assessments or decision revisions yield different reports. Historical assessment report generation is allowed and is visibly historical. Report identity excludes request time so retries preserve original generation metadata. In-product reports and authorized private/no-store JSON download are real; PDF is intentionally deferred.

## Security and UI

Five relations (`releases`, `release_assessments`, `release_decisions`, `release_reports`, `release_audit_events`) have membership SELECT RLS. Composite references independently bind project/environment/import and assessment/decision/report provenance. Closed audit events reference the exact created assessment, decision or report through scoped foreign keys. Direct INSERT/UPDATE/DELETE is revoked for PUBLIC, anon, authenticated, service_role and runner. Only four authenticated SECURITY DEFINER RPCs expose writes; private helpers are revoked. All functions have empty search_path, qualified relations, UTC serialization and no dynamic product SQL. Boundaries check actual OWNER/ADMIN membership before locking/writing. Existing bounded history/input limits apply; release count is capped at 500/project and snapshot JSON is bounded.

Human names/rationales are bounded and reject TestPilot's existing recognizable credential formats, including percent-encoded forms; normal prose such as password reset is allowed. The domain read boundary checks persisted snapshot arithmetic/policy, compatibility and safe text before rendering. No M1.7 runner privileges/memberships change; M1.8 findings and M1.9 Curiosity remain authoritative consumers' sources.

`/releases` supports creation/scope, assessments/signals/coverage, decision/history and report requests. `/reports` lists persisted immutable snapshots. Detail views have traceable finding/investigation/run/memory links and exact quality/QA IDs. History is paginated; empty/error/loading states do not fabricate evidence. Overview shows the latest recorded release assessment and distinguishes absent/stale human decisions. Refresh before deciding: a displayed snapshot is not a live guarantee.

## Verification (disposable local PostgreSQL only)

Never run fixture scripts or bootstrap against hosted Supabase. Apply migrations 001 through 010 to a fresh local compatible database, then run `supabase/tests/release-intelligence.sql`, `release-intelligence-signals.sql` and `release-intelligence-clock.sql`. Clock tests substitute only local calculation clocks within a rollback transaction and verify execution rows stay unchanged. Security fixtures use synthetic values; no HTTP or AI calls occur.

```powershell
node tooling/verify-release-concurrency.mjs 'C:/Program Files/PostgreSQL/15/bin/psql.exe' <fresh_name_m111_concurrency>
node tooling/verify-release-policy-parity.mjs 'C:/Program Files/PostgreSQL/15/bin/psql.exe' <local_m111_database>
```

Local database regressions, concurrency tests, policy parity and repository quality gates passed. Hosted 01000 catalog/function verification passed on PostgreSQL 17.11: schema, definitions, RLS and grants matched the locally tested implementation, with only the expected owner-only PG17 MAINTAIN privilege difference. Local/remote migration histories align through 01000; no blocking defects were identified. Authenticated hosted browser acceptance was not performed, and hosted concurrency behavior was not exercised. Local PostgreSQL 15 cannot run PG17-specific injected MAINTAIN tests; local concurrency results remain distinct from hosted behavior. M1.12 hardening is in progress; 01100 is deployed and local/remote migrations align through 01100.
