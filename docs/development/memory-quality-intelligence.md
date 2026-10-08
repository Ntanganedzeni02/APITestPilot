# M1.10 Evidence Memory + API Quality Intelligence

Implemented and deployed. Migration `20261007000900_memory_quality_intelligence.sql` is deployed; local/hosted histories align through 00900 and final hosted verification passed. Local PostgreSQL tests remain distinct from hosted/browser acceptance. M1.11 Release Intelligence + Reports is implemented and deployed; hosted catalog/function verification passed and local/remote migrations align through 01000. Actual AI interpretation, embeddings, conversational Ask and predictive models remain deferred.

## Authority and persistence

Domain owns closed memory types, arithmetic constants, scoring version, deterministic trend and provider-neutral bounded queries. The database adapter implements reads and the two authenticated RPCs. Server actions resolve current workspace/project and validate environment ownership; they send only project/environment IDs. PostgreSQL computes authoritative inputs from existing records in one statement snapshot. A browser cannot supply claims, provenance, score components or explanations. AI has no write authority. The separate runner keeps its five M1.7 RPCs and receives no new grants.

`memory_facts` groups a scoped, hashed logical claim; `memory_observations` retains each supporting occurrence. `quality_assessments` stores immutable structured snapshots; `quality_heads` only tracks the current and previous distinct identities, including state cycles A -> B -> A. None duplicates execution payloads, findings, evidence, QA items or investigations.

Independent membership SELECT RLS protects all four tables and the security-invoker `project_memory` view. Composite FKs bind project/workspace, import/graph/case/environment/run, package/result, assertion item, finding, human review and investigation provenance. Direct mutation is revoked. Private helpers are not callable by authenticated users, anon, service role or runner. SECURITY DEFINER entry points use an empty search path and qualified relations, require auth.uid(), lock membership and validate environment/project before deriving. Refresh and assessment serialize on the project row. Unique fingerprints independently enforce retry safety. Unsupported or unsafe execution results are skipped. Limits reject histories above 5,000 runs per environment, 5,000 known operations, 1,000 active requirements or 8,000 risk-weight units; input JSON is bounded to 2 MB. A capacity error rolls back the RPC; it never silently truncates a score.

## Evidence Memory

Implemented claims: verified success (sent, nonempty assertions, all PASS), failed assertion (sent with FAIL), separately classified execution error, sent observation, human confirmation, human dismissal, re-observation following dismissal, and persisted concluded/stopped investigation. BLOCKED/CANCELLED does not prove behavior. A Curiosity conclusion records its closed conclusion code, never defect confirmation.

Fact identity hashes workspace/project/environment/import/graph/case/uniquely attributable safe operation/kind/assertion-or-error identity/finding. A failure identity excludes prose/status but includes the assertion's declared expectation and safe actual comparison value; materially different comparisons stay distinct. Source observation identity hashes the run/package/item/review/investigation/claim. Retry adds zero; an equivalent new execution appends provenance and increments count. First/last times reflect source observation times, not refresh time. Observation actors and timestamps preserve derivation attribution. Existing M1.8 and M1.9 audit records plus append-only observation provenance suffice; no duplicate audit system is added.

No raw bodies, request headers, secrets, review notes, model reasoning or arbitrary summaries enter memory. Claims are closed codes; identities are SHA-256; existing redacted evidence is referenced. Unsafe operation identifiers are omitted. Detail links inspect typed evidence and closed result/assertion outcomes without copying payloads. Human finding decisions remain authoritative. Later dismissal re-observation is explicit and never changes DISMISSED to CONFIRMED.

Currentness is derived at read time: a fact for a nonlatest import is HISTORICAL; a previous behavioral fact for the same case/env/source is SUPERSEDED when a later eligible observation exists; a finding decision mismatching current human state is SUPERSEDED; otherwise CURRENT. No history is erased. CURRENT means latest known observation, not timeless truth; first/last timestamps expose age. Development evidence never becomes production truth. A new import never inherits prior verification.

Memory lists filter environment, exact operation identity, closed kind/currentness, and paginate 25 facts; details paginate 25 observations. Quality history paginates 25 snapshots. Loading/empty/error states are explicit. Explicit Refresh Memory safely derives eligible existing sources and reports new observation count. Quality assessment does not implicitly execute HTTP or create evidence for missing results. Derive M1.8 evidence or refresh memory before assessing newly completed runs.

## Reproducing api-quality-v1

All ages use UTC calendar dates (negative clock skew clamped to zero). Recent is day 0-7 inclusive, aging day 8-30, stale day 31+. The latest imported source and its latest QA analysis define scope, ordered by created_at then UUID descending for ties. A known operation is a distinct normalized operation key in that source. Executions must match environment and source, have safe persisted results and M1.8 evidence packages, and map uniquely to a known operation. An asserted execution was sent and has at least one PASS or FAIL assertion; NOT_EVALUATED does not count.

The latest QA review defines active requirements/risks: latest REJECT excludes an item; unreviewed/EDIT remains active but uncovered. Coverage requires current APPROVE, linked case in the same analysis, asserted evidence within 30 days, and review preceding execution. Requirement coverage additionally matches the frozen plan's exact current approved review ID, approved status and no edits. New review/version cannot inherit stale approval evidence. Risk severity weights are LOW=1, MEDIUM=2, HIGH=4, CRITICAL=8. Coverage means observed, not passing; failing coverage is reflected separately in execution/finding health.

Each dimension rounds to an integer using nonnegative half-up rounding. Sufficiency combines exact rational fractions before half-up rounding, avoiding JavaScript and PostgreSQL intermediate-division drift:

| Dimension    | Numerator / denominator                                                                                 | Weight |
| ------------ | ------------------------------------------------------------------------------------------------------- | ------ |
| Requirements | covered active requirements / active requirements                                                       | 25%    |
| Risks        | covered severity-weighted risks / active risk weight                                                    | 25%    |
| Execution    | sum of per-operation health points / (100 × known operations)                                           | 25%    |
| Findings     | (100 × known operations - sum of maximum active penalty per known operation) / (100 × known operations) | 15%    |
| Freshness    | sum of per-operation freshness points / (100 × known operations)                                        | 10%    |

Dimension score = round(100 × numerator / denominator); zero denominator yields null/Unknown. Execution health uses only the latest eligible <=30-day execution per operation: round(100 × PASS / (PASS + FAIL)); ERROR earns zero points without defect confirmation. Operation-based weighting prevents repeated low-value runs inflating the dimension. Unverified operations contribute no health points and appear as explicit gaps. An earlier asserted run may still provide coverage when a later infrastructure error reduces health; these are different facts.

Finding penalties use maximum severity penalty per known operation, rather than duplicate occurrence volume: INFO=0, LOW=10, MEDIUM=30, HIGH=60, CRITICAL=100; CONFIRMED multiplier=1, CANDIDATE=0.25, DISMISSED=0. Existing M1.8 has no resolved state; this model does not invent one. Repeated occurrences appear in memory, not double-counted penalties. Only findings from the selected source/environment count. An unresolved finding is not dropped merely because its operation evidence became stale. The finding dimension remains Unknown when there are no recently asserted operations.

Freshness uses the latest asserted execution per operation, earning 100 points through day 7, 50 through day 30, zero thereafter. An operation without asserted evidence earns zero and stays unverified. Old source evidence is excluded entirely.

Overall = round((25 × requirements + 25 × risks + 25 × execution + 15 × findings + 10 × freshness) / 100). Missing dimensions contribute zero without renormalizing weights, and remain explicitly Unknown. Overall is null when no known operations or no recently asserted operations. Unknown is not failed or passed.

Sufficiency = round(40 × recently_asserted/known + 20 × covered_requirements/active_requirements + 20 × covered_risk_weight/active_risk_weight + 20 × freshness_points/(100 × known)). Zero denominators contribute zero. HIGH requires at least five recently asserted operations and sufficiency >=80; MEDIUM requires at least three and sufficiency >=40; otherwise LOW. A one-operation project can score 100 but never receives HIGH confidence. Status is UNKNOWN for null overall, STRONG >=80, MODERATE >=50, WEAK below50. These labels never mean ready to release.

Snapshots persist exact scalar inputs, dimension numerator/denominator/basis/weight, gap IDs (operation identities hashed), UUID provenance, scoring version, source/environment, actor and timestamp. Fingerprints hash scoring version/scope plus authoritative input state: run/package/finding/review IDs, finding revisions/status/severity, coverage decisions and evidence age bands. Secrets, raw payloads and the current clock string are excluded. Unchanged relevant state reuses the snapshot; new inputs or a freshness band transition produces a distinct snapshot. Historical snapshots are never recalculated. A reused snapshot retains original assessed_at; head refreshed_at records selection time.

Trend compares previous distinct state only for the same workspace/project/environment/import/scoring version. Null dimensions remain incomparable; scope/version change gets an explicit reason, not an invented delta. Overall, sufficiency and dimension deltas are computed by subtraction. Changed dimensions are structured contributors, not AI causal stories.

## UI and future queries

Overview displays current assessment, dimensions, basis, sufficiency/confidence, trend and timestamp. `/quality` selects environment, assesses, lists exact gaps/provenance and immutable history. A source change labels the old assessment historical until refreshed. `/memory` provides actual observations and provenance detail. There is no static working score, release recommendation or autonomous exploration.

`MemoryQualityQuery` and `createIntelligenceQueries` expose bounded operation, recurring-failure, human finding, investigation, quality gap and current assessment reads for future Ask. Recurring failures are filtered within each explicit page, not claimed as an exhaustive search. No AI provider, chat memory, vectors or cross-project aggregation is introduced.

## Verification commands

Use the repository-local Node 24/pnpm 12.9.1 setup documented in development setup. `pnpm test` includes domain arithmetic/trend, adapter boundaries, action authorization and UI rendering fixtures. SQL files require a **disposable local** PostgreSQL/Supabase-compatible database with bootstrap, extensions and migrations 001-009; never run bootstrap or fixture tests against hosted Supabase.

```powershell
& 'C:/Program Files/PostgreSQL/15/bin/psql.exe' -X -h 127.0.0.1 -p 55433 -U postgres -d <local_fixture_db> -v ON_ERROR_STOP=1 -f supabase/tests/memory-quality.sql
node tooling/verify-memory-quality-concurrency.mjs 'C:/Program Files/PostgreSQL/15/bin/psql.exe' <fresh_name_m110_concurrency>
```

The concurrency harness creates a fresh local database, uses separate authenticated fixture sessions and proves actual PostgreSQL lock waits before verifying one observation/count and one snapshot/head. Existing M1.2-M1.9 SQL and M1.8/M1.9 concurrency remain required regressions. Migration00900 is deployed; local/hosted histories align through 00900 and final read-only hosted catalog verification passed. Hosted mutation-based/browser behavior remains separate from local regressions.

Memory operation identifiers use the existing recognizable credential formats at the SQL persistence boundary and domain read boundary. Unsafe identifiers are omitted; scoped execution/evidence/finding/investigation IDs retain provenance. Verified operation success is omitted when safe operation attribution is unavailable.

Additional disposable local regressions: `supabase/tests/memory-quality-credentials.sql` verifies credential omission, stopped-investigation provenance and persisted UI query output; `supabase/tests/memory-quality-clock.sql` substitutes only the assessment clock within a rolled-back local transaction, proving freshness transitions with unchanged execution rows and UTC session-timezone independence. Neither test is suitable for hosted databases.
