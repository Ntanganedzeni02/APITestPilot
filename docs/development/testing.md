# Testing strategy

## Current tooling

M0.2 configures Vitest with a Node environment, explicit imports and mock cleanup.
`pnpm test` runs once; `pnpm exec vitest` enables local watch mode.
The root config discovers tests in future package source/tests directories,
repository tests and tooling. No product code or product tests exist.
`tooling/foundation.test.ts` checks workspace/compiler contracts and verifies
that unchecked indexed access produces a compiler diagnostic. It is a tooling fixture.
No pass-with-no-tests option hides missing tests.
M0.3 adds `tooling/workspaces.test.ts` to verify expected boundaries, unique names,
consistent scripts/configuration, domain manifest independence, absence of circular
workspace dependencies and required documentation. It exercises the actual ESLint
configuration with forbidden domain imports and an allowed relative import.
These checks verify engineering architecture, not product behavior.

`pnpm lint`, `pnpm typecheck` and `pnpm format:check` validate tooling.
`pnpm build` compiles empty workspace exports and declaration files. This is a
boundary compilation check, not an application build. GitHub Actions runs these
checks with frozen-lockfile installation. Packages have no individual test scripts
because they have no behavior to test; the root owns foundation verification.

## Intended tooling and coverage

Vitest is installed for unit/integration testing. Playwright remains a future
end-to-end candidate and is neither installed nor configured. Future checks cover:

- Deterministic parsing, invariants, graph provenance and structured-output
  validation, including malformed/adversarial imported content.
- Policy decisions, approvals, restrictive production defaults, side effects
  and bounded investigation budgets.
- Tenant isolation across persistence, jobs, evidence, memory and AI context.
- Runner authentication/actors, extraction, dependencies, setup/cleanup,
  assertions, cancellation, timeouts, retry and flakiness behavior.
- Redaction before ordinary logging/persistence/AI/display/export boundaries.
- Human review, inspectable evidence and final defect/release authority.

Use clearly labeled fixtures and controlled test APIs. Production execution
requires explicit policy authorization. Adapter contract tests should not assume
live model responses are deterministic. Integration tests verify real boundaries;
end-to-end tests cover critical journeys once implemented.

Report checks actually run, failures and missing tools.
Apply the [definition of done](../../AGENTS.md) according to scope.
