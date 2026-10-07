# Conceptual data model

M1.4 adds `behaviour_graphs` (import-linked snapshot/version/initiator/counts),
`behaviour_graph_nodes` (typed logical identities/provenance), and
`behaviour_graph_edges` (typed scoped endpoints/provenance). Composite foreign keys
bind workspace/project/import/snapshot and both edge endpoints. See
[graph contracts and schema](../development/behaviour-graph.md).

Status: M1.2–M1.5 implement identity/tenancy, API imports, Behaviour Graphs and
requirements/risk analyses with human review. Remaining execution/evidence/release
concepts are future work. The future-model table describes conceptual names;
implemented requirements/risks share the normalized qa_items model.

## Implemented identity model

`auth.users` belongs to Supabase Auth. No duplicate user/profile table is needed.
The migration is `supabase/migrations/20261006000100_identity_tenancy.sql`.

| Table             | Columns and constraints                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| workspaces        | UUID id; normalized 2–80 character name; created_by FK to auth.users; created_at/updated_at                                                              |
| workspace_members | composite PK workspace_id/user_id; both FKs; role check OWNER/ADMIN/MEMBER; created_at; user/workspace lookup index                                      |
| projects          | UUID id; workspace FK; normalized name; created_by FK; created_at/updated_at; unique id/workspace for scoped references; workspace/time/id index         |
| environments      | UUID id; project FK; type check DEVELOPMENT/STAGING/PRODUCTION; created_at/updated_at; unique project/type                                               |
| audit_logs        | UUID id; workspace FK; optional project with composite workspace FK; actor FK; WORKSPACE_CREATED/PROJECT_CREATED check; created_at; workspace/time index |

Names may repeat; UUIDs are stable identities, so no slug uniqueness conflict
exists. Timestamps default to transaction time. M1.2 exposes no rename/update
operation; updated_at equals created_at until a future reviewed mutation design.
Workspace/project deletion and membership administration are also unimplemented.
FK cascades express ownership for future controlled deletion, not permission to
delete. Auth-user deletion requires handling creator/audit references explicitly.

Workspace creation writes OWNER membership and audit atomically. Project creation
writes exactly three logical environments and its audit atomically. Environments
have no base URL, credentials or secrets. Creation functions take no actor ID.
All tenant tables have membership-based RLS and direct mutation access closed.
See [security](security.md) and [ADR 0005](../adr/0005-supabase-identity-and-tenant-context.md).

## Future conceptual model

M1.3 implements `api_imports`: workspace/project scope, actor/time, source format,
filename/byte count/fingerprint, sanitized source JSONB and normalized knowledge
JSONB. `(project_id, workspace_id)` references the scoped project key. Each import
gets a new UUID; operation keys/source pointers are scoped to it. See
[ADR 0006](../adr/0006-immutable-api-knowledge-imports.md) and
[API knowledge development](../development/api-knowledge.md).

| Area          | Concepts                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Tenancy       | users, workspaces, workspace_members, projects, environments, environment_secrets                                               |
| API knowledge | api_specs, api_spec_versions, api_resources, api_endpoints, api_parameters, api_schemas                                         |
| Behaviour     | behaviour_nodes, behaviour_edges                                                                                                |
| QA            | requirements, requirement_sources, risks, test_suites, test_cases, test_steps, test_dependencies, test_assertions, test_sources |
| Execution     | test_runs, test_run_cases, test_results, http_exchanges                                                                         |
| Analysis      | response_analysis, findings, finding_evidence                                                                                   |
| Curiosity     | investigation_sessions, hypotheses, suggested_tests                                                                             |
| Memory        | project_memory                                                                                                                  |
| Release       | releases, release_changes, release_impacts, release_decisions                                                                   |
| Quality       | quality_scores                                                                                                                  |
| AI operations | ai_runs                                                                                                                         |
| Audit         | audit_logs                                                                                                                      |

## Ownership and relationships

Users join workspaces through membership; workspaces contain projects.
Projects contain implemented logical environments; restricted environment secrets remain future concepts.
Specifications have versions; normalized resources, endpoints, parameters,
schemas and graph interpretations retain their source version.

Requirements and sources inform risks and tests. Suites organize cases; steps,
dependencies and assertions define constrained behavior. Runs reference approved
test versions and environments; case results link to captured exchanges.
Findings link to evidence instead of automatically inheriting failure status.
Investigation sessions associate hypotheses, suggested tests and observations.
Release changes inform impacts and scores; recommendations are distinct from
human decisions. Memory, AI runs and audits preserve provenance and project scope.

Enforce workspace/project authorization on tenant-owned records and prevent
cross-tenant references. Browser-supplied workspace_id is never proof of access.
Keys/constraints/RLS for M1.2 are implemented above. Retention and enforcement for
future evidence/execution concepts still need design.

## Graph and evidence

Nodes/edges model actors, resources/entities, endpoints/actions, states,
workflows and dependencies. Inferred relationships carry provenance, confidence
and approval/verification status. Sources include OPENAPI, DOCUMENTATION,
AI_INFERENCE, RUNTIME_OBSERVATION and HUMAN.
Initial storage uses PostgreSQL nodes/edges; see
[ADR 0002](../adr/0002-postgresql-behaviour-graph.md).

Traceability follows Requirement -> Risk -> Test Case -> Test Result -> Finding
-> Evidence. Finding concepts include OBSERVATION, ANOMALY, POTENTIAL_DEFECT,
PROBABLE_DEFECT, CONFIRMED_DEFECT, EXPECTED_BEHAVIOUR and FALSE_POSITIVE.
These are conceptual classifications, not a finalized state machine.
Humans retain confirmation authority. See [security](security.md).

## Implemented M1.5 intelligence

The additive qa_analyses/qa_items model pins an exact import and graph snapshot.
Normalized node/edge/requirement junctions enforce scoped foreign keys. Immutable
generated originals coexist with labelled human additions and append-only
qa_reviews; effective approval derives from ordered review decisions. A dedicated
qa_audit_events table preserves actors and events without changing M1.2 audit
constraints. All seven tables independently enforce membership SELECT RLS and
deny direct writes. See [M1.5 design](../development/qa-intelligence.md).

## Implemented M1.6 planning

Eight tenant-scoped planning/version/definition/link/review/audit tables preserve exact analysis, requirement reviews and graph/import bindings. Same-plan typed scenario parents and relational QA/graph FKs protect traceability; narrow transactional RPCs and membership read RLS govern persistence. See [planning model](../development/test-planning.md).

M1.7 adds immutable environment execution configurations, pinned execution runs,
immutable results and execution audit under independent RLS and narrow RPCs.
A dedicated runner role claims/evaluates/completes jobs; browser users cannot mutate
safety or results. See [execution persistence](../development/safe-execution.md).

## Implemented M1.8 evidence and findings

Evidence packages and typed items reference immutable M1.7 runs/results rather
than copy request/response payloads. Logical findings have distinct per-execution
occurrences and a closed CANDIDATE ? CONFIRMED/DISMISSED lifecycle. Append-only
human reviews and scoped audit events preserve attribution. Canonical SHA-256
manifests, idempotent derivation, composite tenant keys and independent SELECT RLS
protect provenance; two authenticated transactional RPCs govern all mutations.
The runner retains only its five M1.7 capabilities. AI interpretation remains a
non-authoritative validated proposal boundary with no provider calls. See
[evidence and findings](../development/evidence-findings.md). Migration
`20261007000700_evidence_findings.sql` is deployed to hosted Supabase; local and
hosted migration histories are aligned through 00700. Final hosted M1.8
verification passed.

## Implemented M1.9 curiosity

Four RLS-protected investigation/proposal/citation/audit tables bind source packages,
known planning/graph scope, reviewed proposal fingerprints and resulting M1.7 runs.
Composite references bind evidence items to packages and execution cases/results to
the same tenant. Narrow authenticated RPCs enforce budgets and serialize retries.
Migration `20261007000800_curiosity_engine.sql` is deployed to hosted Supabase.
Local and hosted migrations are aligned through 00800; M1.9 post-deployment
verification passed. M1.10 Memory + API Quality Intelligence has not started;
00900 does not exist. Actual AI-provider integration remains deferred, and
resource-ID investigation workflows remain limited by identifier provenance.
See [curiosity persistence](../development/curiosity-engine.md).
