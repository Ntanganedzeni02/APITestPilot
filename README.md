# TestPilot

TestPilot is a planned AI-powered API quality and testing SaaS platform.
Give it your API to understand behavior, investigate risks and provide
evidence-backed release confidence.

**M0.2: monorepo tooling foundation. Product implementation has not started.**
pnpm workspaces, strict TypeScript, ESLint, Prettier and Vitest are configured.
Documentation and architectural placeholders remain intact. No web application,
database, AI integration, runner or product build tooling exists.

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

Planned directories separate apps/web, workers/api-runner and focused packages.
Application, worker and package directories contain only empty .gitkeep files.
Tooling checks live in `tooling/`; see [setup](docs/development/setup.md).
