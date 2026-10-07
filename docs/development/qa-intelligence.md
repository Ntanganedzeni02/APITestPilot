# M1.5 requirements and risk intelligence

M1.5 derives reviewable QA proposals from an exact immutable API import and
Behaviour Graph snapshot. It does not generate or execute tests, confirm defects,
infer arbitrary state transitions, or make release decisions.

## Boundaries and model

`packages/domain` owns the taxonomy, proposal/snapshot/review contracts and
validation. `packages/qa-intelligence` owns deterministic rules, bounded analysis
orchestration and traceability queries. `packages/ai` owns the vendor-independent
provider interface, evidence request and strict output validator. `packages/database`
implements normalized persistence; web actions resolve the authenticated project
context and compose these interfaces. No new third-party dependency or vendor SDK
was installed; workspace dependencies and build ordering were extended.

An analysis records workspace, project, import, graph, engine version, creator,
completion/creation time, original generated count and separate AI status/metadata.
Each REQUIREMENT/RISK has a logical identity, title, statement, category, origin,
derivation, confidence, rule, concise explanation, source pointers and graph
node/edge references. Risks also have severity, priority and requirement links.
Severity is a review priority signal, not a measured runtime impact or finding.

Origins remain distinct: SPEC_EXPLICIT/EXPLICIT, GRAPH_DERIVED/DETERMINISTIC_INFERENCE,
AI_PROPOSED/AI_INFERENCE, HUMAN_AUTHORED/HUMAN. All proposals start PROPOSED. No
rule or provider automatically approves content. Category registries support
16 requirement and 15 risk categories; only supported rules emit categories.

## Deterministic engine 1.0.0

Requirement rules:

| Rule                      | Evidence and meaning                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| REQ_REQUIRED_PARAMETER    | Required declared path/query/header/cookie parameter                                         |
| REQ_REQUIRED_BODY         | Explicitly required operation request body                                                   |
| REQ_REQUIRED_PROPERTY     | Required property of a declared component schema                                             |
| REQ_SCHEMA_TYPE           | Declared component/property type                                                             |
| REQ_SCHEMA_ENUM           | Explicit finite enum values; no inferred transitions                                         |
| REQ_RESPONSE_SCHEMA       | Declared response schema reference, including array items                                    |
| REQ_SECURITY              | Effective security alternatives, respecting empty overrides and anonymous alternatives       |
| REQ_IDENTIFIER_DEPENDENCY | Existing graph-proven compatible producer/consumer identifier; not mandatory execution order |

Risk rules:

| Rule                    | Observation and QA coverage surface                                            |
| ----------------------- | ------------------------------------------------------------------------------ |
| RISK_DESTRUCTIVE        | Graph-proven resource deletion; destructive-path coverage                      |
| RISK_SECURITY_SURFACE   | Declared security requirement; authentication/authorization coverage           |
| RISK_COMPLEX_INPUT      | At least 8 required fields, nesting depth 4, or schema composition             |
| RISK_DEPENDENCY         | Proven identifier/setup dependency                                             |
| RISK_STATE_SET          | Graph-supported possible resource states; transitions unknown                  |
| RISK_AUTH_ALTERNATIVES  | Multiple declared security alternatives                                        |
| RISK_ERROR_GAP          | Successful response declared without a 4xx/default error contract              |
| RISK_UNSECURED_MUTATION | Proven mutation has no mandatory declared security in an otherwise secured API |

Reasons are deterministic templates. Missing error/security declarations describe
specification coverage, never proof of incorrect runtime behavior or a vulnerability.
Rules do not guess roles, permissions, SLAs, idempotency, rate limits or arbitrary
business state. Typed resources and identifier compatibility come from M1.4.
Stable JSON-tuple identities, code-point ordering and keyed deduplication make
identical normalized input deterministic. Limits reject oversized analyses visibly
rather than persisting truncated results: 1,000 total proposals, 30 distinct evidence
references per field, 160-character titles, 4,000-character statements,
2,000-character reasons and 4 MiB serialized analysis. Complex-schema traversal
is bounded to 5,000 visits/depth 32. Detailed derivation covers direct component
properties; it does not expand every inline/nested OpenAPI fact into prose.

Queries include requirements for operation/resource/schema, risks for operation/
resource/requirement, items by source pointer or graph node/edge, approved/rejected
requirements and unresolved proposals. Structural association uses adjacency maps
and follows declared schemas, not runtime order. SQL reverse indexes support
node/edge/requirement lookup; the adapter groups junctions by item and pages reads
in 500-row batches. Counts and scope checks reject missing/malformed provider data.

## Human review and history

OWNER/ADMIN can approve, reject or edit. MEMBER can view, add and edit proposals,
but cannot approve/reject. Every edit resets the effective state to PROPOSED and
preserves the original generated title/statement/provenance. Approval/rejection
applies to the most recent edited version. Reviews append an actor, timestamp,
monotonic revision, decision, optional rationale and edited text. The caller must
supply the last observed review UUID; stale decisions fail and require reload.
Database row locks serialize review decisions and protect the checked membership
role against concurrent modification. Human additions are separately labelled,
append to a selected analysis and do not change its original generated count.
Manual risks may have no requirement link; they still require graph/source evidence.

Re-analysis creates a new analysis UUID; re-import/rebuild does not rewrite old
analysis source IDs. Exact import/graph lookups are supported independently of
latest-history list limits. UI selectors currently expose the latest 50 imports
and latest 10 analyses; older rows remain preserved. Full-history browsing is a
future extension, not silent replacement of history.

## AI boundary

`QaIntelligenceProvider` supplies provider/model IDs and accepts a versioned
structured request plus AbortSignal. No concrete provider is configured in the
application. Deterministic analysis works without AI credentials.

The JSON schema/runtime validator accepts at most 50 proposals, known categories,
bounded text/questions, STRONG/SUPPORTED confidence and only existing opaque
citation tokens. It rejects extra fields, tenant/graph ownership, statuses,
APPROVED attempts, invented/cross-context references and malformed JSON. Source
and graph references are mapped from the trusted exact-context catalog. AI logical
identities hash canonical proposal content and are stable across output ordering.
Successful AI provenance records provider/model, prompt/analysis versions, input
catalog tokens, timestamp and explicit structured validation success. Only concise
user-facing reasons/questions are kept; no raw response or chain-of-thought.

Prompts separate trusted instructions and an explicitly untrusted JSON data field.
The foundation sends only bounded graph node/edge type facts with opaque tokens
(up to 500), omitting imported descriptions, summaries, examples, labels, enum
values, URLs, credentials, environment values and tenant IDs. This conservative
catalog limits semantic business-rule reasoning; richer redacted source context
requires a future reviewed provider adapter. Malicious imported descriptions
remain inert and are never promoted into instructions. Proposed AI text is escaped
in the UI and never executable or automatically approved.

Timeout (10 seconds by default), invalid JSON/schema/evidence, provider unavailability
and rate limiting produce FAILED AI status with a safe explanation while retaining
all deterministic proposals. No paid call or hosted model result is claimed.

## Migration and authorization

New migration only: `20261006000400_qa_intelligence.sql`, after migrations
`20261006000100`, `20261006000200`, `20261006000300`. Previous migration files
are unchanged. M1.5 has not been applied to hosted Supabase by this implementation.

Seven tables: qa_analyses, qa_items, qa_item_nodes, qa_item_edges,
qa_item_requirements, qa_reviews and qa_audit_events. A normalized kind discriminator
shares requirement/risk structure. Composite foreign keys bind graph/import/project/
workspace and prevent cross-analysis requirement/review references. Every table has
independent membership SELECT RLS, authenticated SELECT only, and no direct
INSERT/UPDATE/DELETE permission. PUBLIC/anon cannot read or execute writers.

Three narrow public RPCs: create_qa_analysis, review_qa_item, add_human_qa_item.
SECURITY DEFINER writers require auth.uid(), checked workspace membership, exact
source scope, qualified relations and empty search_path. They derive actors from
the session; callers cannot choose creator/reviewer ownership. Private JSON-pointer
and insertion helpers are not executable by application roles. Source pointers
must resolve in the stored sanitized specification; graph references must satisfy
actual scoped foreign keys. SQL parameters/JSON values remain data.

The complete analysis, deterministic proposals, optional validated AI proposals,
junctions and ANALYSIS_CREATED audit event are written in one transaction. Any
failure rolls back all rows. There is no partially persisted running snapshot or
later AI mutation; a later provider attempt creates another analysis. Header and
generated content have no normal update/delete path. Review/manual-add audit
records are appended in the same transaction as the corresponding operation.
The dedicated scoped audit table avoids modifying the existing M1.2 audit enum.

## UI and deployment follow-up

Requirements and Risks are real protected routes. Analyze API pins the displayed
import and graph UUIDs. Pages show counts, source IDs/versions/time, AI status,
filters, lazy proposal details, explanations, provenance, linked requirement keys,
review history and manual-entry controls. Lists render 50 proposals at a time.
Pending controls disable duplicate submissions; validation/persistence failures are
visible. There are no runtime evidence, executions, fake scores or release claims.

The M1.5 migration is deployed according to supplied authenticated CLI evidence.
Complete legitimate hosted analysis/review/tenant acceptance separately. Never use bootstrap on hosted Supabase, service-role verification,
fake hosted JWTs or an email-confirmation bypass. M1.2/M1.3/M1.4/M1.5 deployment is
known from user-supplied evidence; hosted authenticated analysis remains deferred
because of the documented authentication acceptance dependency. This does not
block deterministic/local M1.5 acceptance. M1.6 remains unauthorized.

See [verification evidence](m15-verification.md) and
[ADR 0008](../adr/0008-requirements-risk-intelligence.md).

## Review edit payload bounds

The database checks raw title (160 characters), statement (4000 characters) and
rationale (2000 characters) before normalization. Policy A stores `btrim` title
and statement: surrounding ASCII spaces have no semantic value, and trimmed
content must remain nonempty. The table independently enforces raw limits and
normalized storage. Application limits remain unchanged. Review RPC text inputs
have a combined 32 KiB UTF-8 bound, sufficient for every field limit even at
four bytes per character. APPROVE/REJECT still accept null edit content; roles,
stale-review checks, immutable originals and append-only audit history are unchanged.
