# Conceptual data model

Status: conceptual only. Names below are future concepts, not implemented tables,
columns, migrations, constraints or a finalized schema.

| Area | Concepts |
| --- | --- |
| Tenancy | users, workspaces, workspace_members, projects, environments, environment_secrets |
| API knowledge | api_specs, api_spec_versions, api_resources, api_endpoints, api_parameters, api_schemas |
| Behaviour | behaviour_nodes, behaviour_edges |
| QA | requirements, requirement_sources, risks, test_suites, test_cases, test_steps, test_dependencies, test_assertions, test_sources |
| Execution | test_runs, test_run_cases, test_results, http_exchanges |
| Analysis | response_analysis, findings, finding_evidence |
| Curiosity | investigation_sessions, hypotheses, suggested_tests |
| Memory | project_memory |
| Release | releases, release_changes, release_impacts, release_decisions |
| Quality | quality_scores |
| AI operations | ai_runs |
| Audit | audit_logs |

## Ownership and relationships
Users join workspaces through membership; workspaces contain projects.
Projects contain environments and restricted environment secrets.
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
Exact keys, constraints, retention and enforcement mechanisms need future design.

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
