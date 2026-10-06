# Architecture overview

## Current reality

M0.3 completes the engineering foundation: tooling, nine package workspaces, the
separate runner workspace and GitHub Actions CI exist. Workspaces compile empty
exports; their product responsibilities below remain planned. No product runtime
or deployment exists. `apps/web` remains an uninitialized placeholder until M1.1.

There are no inter-package or external runtime dependencies. Domain manifests
must remain dependency-free, and ESLint restricts domain imports to relative
modules. Tooling tests check package discovery, uniqueness and dependency cycles.
These controls do not constitute a complete enforcement of all future layer
boundaries; relative imports can still require architectural review.

## Dependency direction

Presentation -> Application -> Domain. Infrastructure implements interfaces
owned by application/domain. Composition connects adapters; provider and
framework details must not leak into domain logic.
Application orchestration placement will be decided with the first scoped use
cases; M0.1 does not invent another package.

| Repository path          | Future product responsibility                               |
| ------------------------ | ----------------------------------------------------------- |
| apps/web                 | Presentation and web delivery calling application use cases |
| workers/api-runner       | Separate constrained API execution process                  |
| packages/domain          | Provider-independent entities, invariants and contracts     |
| packages/database        | Persistence adapters                                        |
| packages/api-spec        | Deterministic import and normalization                      |
| packages/behaviour-graph | API system modeling and graph operations                    |
| packages/test-engine     | Structured testing, assertions and orchestration            |
| packages/safety          | Deterministic policies and budgets                          |
| packages/ai              | Validated reasoning workflows and provider adapters         |
| packages/evidence        | Sanitized capture and traceability                          |
| packages/shared          | Small genuinely shared utilities                            |
| tests                    | Future cross-boundary/system tests                          |
| tooling                  | Implemented foundation verification; no product logic       |

Workspace names match directory names under `@testpilot/`, including
`@testpilot/api-runner`. The runner has no startup script or execution behavior.
Database contains no provider, schema or migration; api-spec contains no parser;
behaviour-graph contains no graph operations; test-engine contains no execution;
safety contains no policy engine; ai contains no SDK/provider/workflow; evidence
contains no processing. Shared is for technical primitives, not domain concepts.

Domain must not import React, Next.js, Supabase, Redis, BullMQ, Vercel, AI
providers or UI frameworks. Keep business logic out of framework handlers.
Shared must not become a business-logic dumping ground.

## Technology intentions

TypeScript is the language direction; Node.js/TypeScript the runner direction.
Next.js, Tailwind CSS, shadcn/ui, React Flow and Recharts are web intentions.
PostgreSQL is the initial persistence/graph direction; Supabase the managed
backend candidate. Zod is the validation candidate. BullMQ/Redis are queue
candidates; Vitest/Playwright testing intentions; Vercel a web hosting candidate;
containers the worker deployment direction; Sentry an observability candidate.
AI uses provider-independent abstractions. TypeScript and Vitest are configured
as engineering tooling in M0.2; product technologies remain uninstalled.

Choose the simplest architecture consistent with these boundaries. Further
infrastructure requires a concrete need and ADR.
See [data](data-model.md), [AI](ai-architecture.md), [execution](execution-engine.md),
[security](security.md) and [ADR 0001](../adr/0001-monorepo-architecture.md).
