# TestPilot

TestPilot is a planned AI-powered API quality and testing SaaS platform.
Give it your API to understand behavior, investigate risks and provide
evidence-backed release confidence.

**M1.1: web application foundation and SaaS shell.**
pnpm workspaces, strict TypeScript, ESLint, Prettier, Vitest and GitHub Actions CI
are configured. Nine package boundaries and the API runner boundary build and
typecheck empty exports only. `apps/web` is a Next.js App Router application with
responsive navigation, semantic light/dark themes and truthful empty-state routes.
No authentication, project creation, database, AI integration or functioning runner exists.

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
  [AI abstraction](docs/adr/0004-provider-independent-ai.md)

Directories separate `apps/web`, `workers/api-runner` and focused packages.
The nine package boundaries and runner contain empty source exports. The web app
has presentation components and routes, with no TestPilot domain dependencies.
Root `pnpm build` builds Next.js and verifies workspace compilation; other checks
and setup are documented in [setup](docs/development/setup.md).
CI exists in [.github/workflows/ci.yml](.github/workflows/ci.yml); it has no deployment.

Run `pnpm --filter @testpilot/web dev` and open http://127.0.0.1:3000.
The shell resembles the intended authenticated product, but access control is not
implemented. Do not load customer data or expose it as a protected service.
