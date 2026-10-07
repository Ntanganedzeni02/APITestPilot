# M1.6 test planning intelligence

OpenAPI -> normalized knowledge -> immutable graph -> requirement/risk analysis ->
immutable test plan -> scenarios -> cases -> independent human review. No API
execution, results, runtime evidence, defects or release decisions are implemented.

## Model and boundaries

Domain owns TestPlanInput/TestPlan, PlanningItem/TestItem, RequirementVersion,
TestReview, eligibility, coverage and RTM contracts. Existing test-engine now owns
pure deterministic planning; ai owns the optional provider-independent planning
contract. Database implements scoped persistence and the web app composes actions.
No external dependencies or AI SDK were added; only existing workspace links.

A plan pins exact workspace/project/import/graph/analysis UUIDs plus every
requirement's review UUID, effective title/statement and review status. SQL also
pins its authoritative M1.5 source_kind and whether that version has EDIT history. Database
creation locks requirement rows and rejects stale review versions instead of
silently using newer content. Regeneration creates a distinct physical snapshot;
semantic scenario/case keys are deterministic JSON tuples. Original definitions
remain immutable. Human additions and append-only reviews extend a snapshot
without rewriting its generated definitions. History selectors show latest 10 plans.

Scenario objectives and concrete cases share a bounded discriminated definition.
Cases have a same-plan SCENARIO parent, case strategy, expected contract,
preconditions, symbolic input and relational requirement/risk/graph evidence.
Titles are 160 characters; objective/expected behavior 4000; reasons/rationale
2000; references 30; preconditions 10; plan 4 MiB, 500 scenarios/2000 total items;
AI 30 items/128000 output characters. Input literals are bounded numbers/booleans,
safe text or null; generation uses enum indices rather than copying personal data,
URLs, credentials or arbitrary enum strings into input definitions.

## Rule registry and non-inferences

Required parameter/body/property rules create presence and omission cases. Type
rules create declared/incompatible type concepts without guessing coercion.
Enums cover declared indices and an outside-enum strategy. Known email/uuid/date/
date-time/uri formats generate review-only valid/malformed concepts; unknown formats
produce no inferred format checks. Explicit numeric/length/item boundaries produce
boundary and outside-bound cases. Exclusive bounds are rejection points rather
than falsely valid inclusive boundaries. Resource state nodes permit STATE_VALUE
coverage, never transitions. Security preserves alternatives/conjunctions and
anonymous alternatives; OAuth coverage uses explicitly declared scope indices,
never invented roles or invalid/expired tokens. Declared 4xx contracts produce
review-oriented response scenarios with no invented triggering conditions.
Identifier dependencies record setup, never create resources. Destructive/state/
error-gap risks add investigation concepts, not repeated-delete/recovery semantics.
No SLA, rate limit, numeric score, runtime result or defect is inferred.

Test types: FUNCTIONAL, VALIDATION, AUTHENTICATION, AUTHORIZATION, CONTRACT, STATE,
DEPENDENCY, ERROR_HANDLING, SECURITY. Case types: VALID, MISSING_REQUIRED,
INVALID_TYPE, VALID_FORMAT, INVALID_FORMAT, ENUM_VALID, ENUM_INVALID, BOUNDARY_MIN,
BOUNDARY_MAX, BELOW_MIN, ABOVE_MAX, UNAUTHORIZED, DECLARED_ERROR_RESPONSE,
DEPENDENCY_SETUP, STATE_VALUE, INVESTIGATION, CUSTOM. Other taxonomies can be added
only with reviewed evidence-backed rules.

## Approval, eligibility and priority

Only APPROVED, unedited SPEC_EXPLICIT/GRAPH_DERIVED requirements support
candidate executable deterministic planning. SQL independently enforces this
against the plan-local snapshot, including direct authenticated RPC payloads. PROPOSED deterministic
requirements yield drafts; REJECTED requirements generate no active planning.
Edited requirements use current text but yield review-only concepts because a
previous rule cannot prove the edited prose. AI/human requirements and proposals
remain distinguishable and review-only in this milestone. Every item requires at
least one requirement; risk evidence strengthens coverage/priority, never replaces
requirement linkage. Risk gaps are visible when no testable requirement supports them.

Generated human-source items retain HUMAN_AUTHORED origin and HUMAN_SOURCE
derivation; manual additions retain HUMAN_AUTHORED/HUMAN and separate audit events.
Both are non-executable and require independent test-item review. Mixed plans
accept proposed, approved and edited human requirements without relabelling them.
AI sources cannot become DETERMINISTIC, even after approval; neither human nor
edited sources gain executable status through approval. Later source reviews do
not rewrite historical pinned policy.

IDENTIFIER_FROM_OPERATION requires a non-null canonical OPERATION_PRECEDES_OPERATION
edge in the pinned graph/import/project/workspace. SQL verifies operation endpoints,
the edge in item edgeRefs and both endpoints in nodeRefs. Invalid, foreign, wrong-type
or disconnected references abort the whole operation. This is provenance validation,
not runtime dependency resolution.

Scenario approval never approves cases. OWNER/ADMIN can approve/reject/edit;
MEMBER can create/propose/edit but cannot final-approve/reject. Actor comes from
Auth, not submitted form data. EDIT resets effective review state to PROPOSED,
preserves originals and records new revision/audit. Raw review text is bounded
before btrim normalization; table constraints independently protect stored edits.

A case is NON_EXECUTABLE for investigation/proposal-only or rejected content;
REVIEW_REQUIRED until its scenario/case and all pinned requirements are approved;
BLOCKED_BY_DEPENDENCY when explicit setup remains; otherwise APPROVED_FOR_EXECUTION
is planning eligibility only. The future Safety Engine must independently authorize
any execution. This milestone cannot satisfy setup or authorize API requests.
Priority ROUTINE/HIGH/URGENT follows highest linked risk severity, with a written
reason rather than a numeric score.

## AI boundary

TestPlanningProvider receives strict instructions plus opaque approved requirement,
non-rejected risk and graph-node tokens/categories. Source descriptions, enum
values, URLs, credential material and requirement/risk free prose never enter the
request. Malicious instructions remain inert displayed data. Strict structured
validation rejects unknown fields, ownership/status/result claims, invented or
rejected/cross-analysis refs, unsupported types, oversized output and duplicate
logical keys. Accepted proposals are AI_PROPOSED and non-executable. Timeout,
rate-limit/unavailable/malformed output records FAILED separately while preserving
deterministic results; no provider records NOT_CONFIGURED. No real provider call
or provider SDK is needed. Opaque context deliberately limits business reasoning;
validation proves shape/scope, not truth of model prose.

## Persistence and traceability

Local migration 20261006000500_test_planning.sql creates test_plans,
test_requirement_versions, test_items, test_item_qa_links, test_item_nodes,
test_item_edges, test_reviews and test_audit_events. Composite FKs bind plans to
exact QA/graph/import/project/workspace, cases to scenario/plan, links to QA kind/
analysis and nodes/edges to pinned graph. All eight tables have membership SELECT
RLS; direct application DML is revoked. Only create_test_plan, review_test_item and
add_human_test_item are executable by authenticated callers. Private insertion is
revoked. SECURITY DEFINER callers require auth.uid/membership, empty search_path,
qualified relations and static SQL. Creation is one transaction, including all
versions, scenario/case rows, evidence and PLAN_CREATED audit. No prior migration
is modified, no dynamic SQL, extension, external fetch or service role is needed.

Human additions copy a selected scenario's traceability, use HUMAN_AUTHORED,
remain non-executable and must pass the same bounded/reference validation.
Audit records plan creation, scenario/case decisions and human additions, with
small server-derived event/actor fields. Requirement/graph source changes cannot
rewrite existing plans. Database provenance validation establishes scope, not
semantic proof that a caller ran the deterministic engine.

Query helpers provide planningState, executionEligibility, planningCoverage,
planningItemsBy (requirement/risk/node/parent) and traceabilityRows. Coverage means
active planned scenario linkage, not runtime verification or quality. RTM rows
connect pinned requirement -> risks -> scenarios -> cases -> review/eligibility;
no result columns exist. Active rejected items do not count as coverage.

## Test Studio and limitations

Protected /tests selects a specific analysis and displays plan history, source IDs,
AI state, summary counts, Scenarios/Test Cases/Coverage/Traceability views and
review/origin/type/priority/eligibility/evidence filters. Details expose why, original
and current text, preconditions, symbolic input, source/graph/requirement/risk links
and append-only reviews. Lists show 50 items; data is preserved in storage.
Read reconstruction caps each related history query at 10000 rows and reports an
error instead of silently truncating. Manual proposals require a scenario template;
there is no detached manual test flow. Approved AI/human prose is not compiled into
an execution DSL. Recursive/composed schemas and complex business rules require
future reviewed expansion, not speculative executable output.

M1.2-M1.6 deployment is known from supplied authoritative evidence. M1.6 passed
security re-preflight and its migration was deployed by the user. Hosted
planning acceptance remains deferred if no legitimate authenticated session is
available. Labelled local production-component/PostgreSQL fixtures use disposable
Auth claims and cannot substitute for hosted Auth/PostgREST acceptance. No M1.7
or execution engine may begin without authorization.

See [M1.6 verification evidence](m16-verification.md) for exact checks and deferred hosted acceptance.
