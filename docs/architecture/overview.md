# Architecture overview

## Current reality
Only documentation and empty directories exist. All components below are planned;
no runtime, dependency enforcement or deployment is implemented.

## Dependency direction
Presentation -> Application -> Domain. Infrastructure implements interfaces
owned by application/domain. Composition connects adapters; provider and
framework details must not leak into domain logic.
Application orchestration placement will be decided with the first scoped use
cases; M0.1 does not invent another package.

| Planned path | Responsibility |
| --- | --- |
| apps/web | Presentation and web delivery calling application use cases |
| workers/api-runner | Separate constrained API execution process |
| packages/domain | Provider-independent entities, invariants and contracts |
| packages/database | Persistence adapters |
| packages/api-spec | Deterministic import and normalization |
| packages/behaviour-graph | API system modeling and graph operations |
| packages/test-engine | Structured testing, assertions and orchestration |
| packages/safety | Deterministic policies and budgets |
| packages/ai | Validated reasoning workflows and provider adapters |
| packages/evidence | Sanitized capture and traceability |
| packages/shared | Small genuinely shared utilities |
| tests | Future cross-boundary/system tests |
| tooling | Future repository engineering tools |

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
AI uses provider-independent abstractions. None is installed or configured.

Choose the simplest architecture consistent with these boundaries. Further
infrastructure requires a concrete need and ADR.
See [data](data-model.md), [AI](ai-architecture.md), [execution](execution-engine.md),
[security](security.md) and [ADR 0001](../adr/0001-monorepo-architecture.md).
