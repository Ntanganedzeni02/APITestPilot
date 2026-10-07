# TestPilot

M1.3 imports deterministic OpenAPI 3.0/3.1 knowledge. M1.4 builds immutable
deterministic Behaviour Graphs. M1.5 adds specification/graph-backed requirements
and risk proposals, provenance and append-only human review. See
[requirements/risk rules and security](docs/development/qa-intelligence.md),
[graph rules](docs/development/behaviour-graph.md) and
[API import](docs/development/api-knowledge.md).

M1.2/M1.3/M1.4 migrations are deployed to Development Supabase per supplied
evidence. The M1.5 migration is local and requires separate reviewed deployment.
Hosted authenticated acceptance remains deferred. AI proposals have a validated
provider-independent contract; no real provider is configured. AI/LLM graph
inference, speculative graph generation and API execution do not exist.

TestPilot is a planned AI-powered API quality and testing SaaS platform.
Give it your API to understand behavior, investigate risks and provide
evidence-backed release confidence.

**M1.5: deterministic requirements/risk intelligence implemented locally; hosted deployment and authenticated verification remain separate.**
pnpm workspaces, strict TypeScript, ESLint, Prettier, Vitest and GitHub Actions CI
are configured. `apps/web` has Supabase SSR email/password authentication,
protected routes, persisted workspace onboarding and project selection. Domain
rules are provider independent; database operations use a dedicated adapter and
version-controlled RLS migrations. Projects create DEVELOPMENT, STAGING and
PRODUCTION environments atomically. M1.3–M1.5 add API knowledge, graphs and reviewable QA intelligence; no functioning runner or real model integration exists.
Without Supabase configuration, auth pages explain setup and product access is
closed. No sample tenant data is displayed.

## Documentation map

- [Engineering constitution](AGENTS.md)
- Product: [vision](docs/product/vision.md), [principles](docs/product/principles.md),
  [user journey](docs/product/user-journey.md)
- Architecture: [overview](docs/architecture/overview.md),
  [data model](docs/architecture/data-model.md),
  [AI](docs/architecture/ai-architecture.md),
  [execution](docs/architecture/execution-engine.md),
  [security](docs/architecture/security.md)
- Development: [setup](docs/development/setup.md),
  [testing](docs/development/testing.md),
  [conventions](docs/development/conventions.md)
- ADRs: [monorepo](docs/adr/0001-monorepo-architecture.md),
  [graph storage](docs/adr/0002-postgresql-behaviour-graph.md),
  [runner](docs/adr/0003-separate-api-runner.md),
  [AI abstraction](docs/adr/0004-provider-independent-ai.md),
  [identity and context](docs/adr/0005-supabase-identity-and-tenant-context.md)

Directories separate `apps/web`, `workers/api-runner` and focused packages.
Domain, database, api-spec, behaviour-graph, qa-intelligence and ai implement M1.2–M1.5; test-engine, safety, evidence, shared and the runner retain their earlier foundation scope.
The web app composes domain-owned persistence operations through the database adapter.
Root `pnpm build` builds Next.js and verifies workspace compilation; other checks
and setup are documented in [setup](docs/development/setup.md).
CI exists in [.github/workflows/ci.yml](.github/workflows/ci.yml); it has no deployment.

Run `pnpm --filter @testpilot/web dev` and open http://127.0.0.1:3000.
Configure Supabase first using [setup](docs/development/setup.md). See
[testing](docs/development/testing.md) for real SQL policy tests and the remaining
live authentication/tenancy verification checklist.
