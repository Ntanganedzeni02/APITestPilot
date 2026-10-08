# Architecture overview

M1.5 adds deterministic requirement/risk analysis, strict provider-independent AI
proposal contracts and append-only human review. Its migration remains local.
See [intelligence design](../development/qa-intelligence.md) and
[ADR 0008](../adr/0008-requirements-risk-intelligence.md).

M1.4 adds a pure deterministic Behaviour Graph builder, validated immutable
PostgreSQL graph snapshots and structured API Map graph inspection. See
[graph model/rules](../development/behaviour-graph.md) and
[ADR 0007](../adr/0007-deterministic-behaviour-graph.md). Its new migration remains
deployed to Development Supabase per supplied evidence. No AI or execution capability is added.

## Current reality

M1.2 adds Supabase SSR authentication, protected product routes, workspaces,
membership, projects and logical environments to the M1.1 Next.js shell. Atomic
creation functions, membership-based RLS and minimal creation audit events live
in version-controlled migrations. The implementation requires a configured
Supabase instance; local PostgreSQL policy verification does not prove live Auth.
Responsive navigation, theme selection and truthful future-feature empty states
remain. M1.3 adds deterministic OpenAPI knowledge imports and API Map. M1.2–M1.4 migrations are deployed according to supplied evidence; no real AI provider or execution capability exists.

The web app composes domain, api-spec, behaviour-graph, qa-intelligence and database. Database depends
on domain and Supabase JS; qa-intelligence composes graph helpers and AI contracts. Safety and evidence now own M1.7 policy/redaction; the separate runner composes domain, safety, test-engine and evidence. Domain manifests
must remain dependency-free, and ESLint restricts domain imports to relative
modules. Tooling tests check package discovery, uniqueness and dependency cycles.
These controls do not constitute a complete enforcement of all future layer
boundaries; relative imports can still require architectural review.

## Dependency direction

Presentation -> Application -> Domain. Infrastructure implements interfaces
owned by application/domain. Composition connects adapters; provider and
framework details must not leak into domain logic.
Application composition and server actions live in apps/web/src/lib/auth and
lib/tenancy, lib/api-knowledge, lib/behaviour-graph and lib/qa-intelligence. Database implements domain-owned tenant and API knowledge repositories;
React presentation does not issue Supabase queries. The focused qa-intelligence package owns analysis rules/orchestration independently of web delivery.

| Repository path          | Future product responsibility                                |
| ------------------------ | ------------------------------------------------------------ |
| apps/web                 | Presentation and web delivery calling application use cases  |
| workers/api-runner       | Separate constrained API execution process                   |
| packages/domain          | Provider-independent entities, invariants and contracts      |
| packages/database        | Persistence adapters                                         |
| packages/api-spec        | Deterministic import and normalization                       |
| packages/behaviour-graph | API system modeling and graph operations                     |
| packages/qa-intelligence | Deterministic requirements, risks and analysis orchestration |
| packages/test-engine     | Structured testing, assertions and orchestration             |
| packages/safety          | Deterministic policies and budgets                           |
| packages/ai              | Validated reasoning workflows and provider adapters          |
| packages/evidence        | Sanitized capture and traceability                           |
| packages/shared          | Small genuinely shared utilities                             |
| tests                    | Future cross-boundary/system tests                           |
| tooling                  | Implemented foundation verification; no product logic        |

Workspace names match directory names under `@testpilot/`, including
`@testpilot/api-runner`. M1.7 adds a separately started execution worker with narrow database authority.
Database contains the M1.2 Supabase tenant adapter; supabase/migrations owns schema
and policies. api-spec validates/parses/normalizes bounded OpenAPI imports, with
vendor schemas/types encapsulated and local-only reference resolution;
behaviour-graph builds/validates deterministic immutable graph facts and exposes traversal helpers; test-engine owns deterministic request construction/assertions;
safety owns deterministic execution policy; ai contains structured provider contracts/validation but no configured vendor adapter; evidence owns safe capture redaction. Shared is for technical primitives, not domain concepts.

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

M1.6 activates evidence-backed planning in test-engine, with domain-owned snapshots, database adapters and protected Test Studio UI. Planning remains independent of execution authorization. See [planning architecture](../development/test-planning.md).

M1.7 adds safe execution with a separate runner, deterministic Safety policy and protected Runs UI. Its single migration remains undeployed. See [execution foundation](../development/safe-execution.md).

## M1.11 release boundary

Release Intelligence consumes M1.3 through M1.10 scoped persisted evidence through domain policy and database adapters. Server actions carry bounded human intent; MEMBER reads and OWNER/ADMIN writes are enforced again in SQL. Immutable assessments and reports separate TestPilot's descriptive policy from append-only human decisions. No runner or provider authority is added. See [M1.11 policy](../development/release-intelligence-reports.md) and [ADR 0013](../adr/0013-release-intelligence-reports.md). 01000 is deployed; local/remote histories align through 01000 and hosted catalog/function verification passed with no blocking defects. Local concurrency tests passed; authenticated hosted browser acceptance and hosted concurrency were not exercised. M1.12 has not started; 01100 is absent.
