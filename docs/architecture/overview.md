# Architecture overview

## Current reality

M1.2 adds Supabase SSR authentication, protected product routes, workspaces,
membership, projects and logical environments to the M1.1 Next.js shell. Atomic
creation functions, membership-based RLS and minimal creation audit events live
in version-controlled migrations. The implementation requires a configured
Supabase instance; local PostgreSQL policy verification does not prove live Auth.
Responsive navigation, theme selection and truthful future-feature empty states
remain. No deployment, API import, AI or execution capability exists.

The web app composes @testpilot/domain and @testpilot/database. Database depends
on domain and Supabase JS. Other empty packages and runner remain dependency-free. Domain manifests
must remain dependency-free, and ESLint restricts domain imports to relative
modules. Tooling tests check package discovery, uniqueness and dependency cycles.
These controls do not constitute a complete enforcement of all future layer
boundaries; relative imports can still require architectural review.

## Dependency direction

Presentation -> Application -> Domain. Infrastructure implements interfaces
owned by application/domain. Composition connects adapters; provider and
framework details must not leak into domain logic.
Application composition and server actions live in apps/web/src/lib/auth and
lib/tenancy. Database implements the domain-owned TenantRepository interface;
React presentation does not issue Supabase queries. This avoids an additional
application package before there is a concrete need.

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
Database contains the M1.2 Supabase tenant adapter; supabase/migrations owns schema
and policies. api-spec contains no parser;
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
backend selected for M1.2. Zod is the validation candidate. BullMQ/Redis are queue
candidates; Vitest/Playwright testing intentions; Vercel a web hosting candidate;
containers the worker deployment direction; Sentry an observability candidate.
AI uses provider-independent abstractions. TypeScript and Vitest are configured
as engineering tooling in M0.2. M1.1 installs Next.js, React, Tailwind and the
minimal shadcn/ui primitives. M1.2 installs Supabase JS and SSR. Other planned
product technologies remain uninstalled.

## Web presentation boundary

apps/web/src/app owns route groups: (auth) renders the four auth pages without a
product sidebar; (setup) owns onboarding/workspace creation; (product) renders the
authenticated shell, Overview, project list/creation and approved future-area
empty states. All product pages render dynamically. Proxy verifies claims and
refreshes cookies; each server operation independently verifies the live user.
All auth/product responses are private/no-store. Unknown or unauthorized context
is unavailable without exposing tenant details.

HTTP-only context cookies hold untrusted workspace/project selection hints;
membership and project relationships are resolved server-side on each request.
Navigation metadata has no tenant data. Existing context/account shell slots now
render real persisted selections and sign-out. Client components handle forms,
pending states, mobile navigation and theme; business rules remain in domain.
See [ADR 0005](../adr/0005-supabase-identity-and-tenant-context.md).

Choose the simplest architecture consistent with these boundaries. Further
infrastructure requires a concrete need and ADR.
See [data](data-model.md), [AI](ai-architecture.md), [execution](execution-engine.md),
[security](security.md) and [ADR 0001](../adr/0001-monorepo-architecture.md).
