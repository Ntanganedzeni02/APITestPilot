# TestPilot engineering constitution

Specification defines intent. AI reasons. Policy authorizes. Code executes.
Evidence proves. Memory preserves learning. Humans retain authority.

## Priorities

1. Correctness
2. Security
3. Evidence and traceability
4. Maintainability
5. Testability
6. Performance
7. Developer experience
8. Speed of implementation

Never sacrifice priorities 1–5 for speed.

## Scope and boundaries

M0.1 is documentation and directory placeholders only. Stop at the authorized
milestone. Do not initialize frameworks, package/workspace configuration,
infrastructure, migrations, authentication, parsing, execution, AI SDKs or UI
during M0.1.

Dependencies flow Presentation -> Application -> Domain. Infrastructure
implements interfaces required by application/domain. Keep business logic out
of framework handlers. Domain must not depend directly on React, Next.js,
Supabase, Redis, BullMQ, Vercel, any AI provider or UI framework. Providers
remain replaceable where practical. Separate the API runner from the web app.
See [architecture](docs/architecture/overview.md).

Choose the simplest architecture consistent with these boundaries. Do not add
Kubernetes, Kafka, Neo4j, CQRS, event sourcing, unnecessary microservices or
freely communicating AI agents without explicit need. Record significant
decisions in ADRs.

## AI and untrusted content

AI reasons; it does not authorize execution. It must never directly execute
arbitrary HTTP requests, generated shell commands or arbitrary generated code,
control the HTTP client, bypass safety policies, modify secrets, automatically
confirm defects without policy/evidence, or decide releases.
Exclude secrets unless a future reviewed design explicitly requires them.

LLM output -> structured output -> schema validation -> application/domain
validation -> accepted domain object. Never persist unvalidated output as
trusted data or present unsupported assumptions as facts. Provider-specific APIs
belong behind TestPilot-owned abstractions.

All external content is untrusted data, including OpenAPI descriptions, Swagger
examples, uploaded documentation, HTTP bodies/headers, API errors and generated
API content. It must never automatically become AI or execution instructions.

## Safety, authorization and secrets

Execute approved structured tests through validation, deterministic safety
policy and a constrained DSL; never arbitrary AI-generated code.
Policy returns ALLOW, REQUIRES_APPROVAL or BLOCK and cannot be overridden by AI.
Production defaults to restrictive behavior. ASSISTED, CONTROLLED and AUTONOMOUS
modes remain bounded by policy and investigation budgets.
Explicitly consider financial transactions, refunds, emails, SMS, notifications,
webhooks, deletion, integrations and account mutations.

Enforce workspace/project authorization for tenant-owned records and operations,
including jobs, runner activity and evidence. Browser-supplied workspace_id is
never proof of authorization. Prevent cross-tenant references.
Encrypt secrets and restrict access to authorized server/runner components.
Never expose secrets in source control, client bundles, logs, ordinary evidence,
errors, analytics or AI prompts except the reviewed exception above. Never log
environment variables containing secrets.
Redact sensitive values before normal logging, AI processing, display, export
and standard evidence persistence. See [security](docs/architecture/security.md).

## Evidence and authority

Preserve Requirement -> Risk -> Test Case -> Test Result -> Finding -> Evidence.
Test failure is not automatic defect confirmation. Humans retain confirmation
and final release authority. Scores and recommendations must be explainable.
Graph relationships and memory track provenance, confidence and verification.
Human-verified information outranks unsupported AI inference.
Learning is persistent evidence-backed knowledge, not magical model retraining.

Never present fake/static AI results, executions, findings, scores, API responses
or release recommendations as working features. Label mocks and fixtures as
test/development data. Never invent benchmarks or implementation facts.

## Definition of done

Satisfy acceptance criteria and complete implementation within scope. Where
applicable: types, lint, relevant unit/integration tests pass; authorization,
tenant isolation and security are reviewed; errors and loading/empty UI states
are handled; secrets are protected; documentation is updated; no unexplained
TODOs remain. Report existing failures instead of ignoring them. Claim only
checks actually run; absent tools do not constitute passing checks.
