# Testing strategy

## Current tooling
No test runner, lint, typecheck or build tooling is configured.
M0.1 validation checks required files, relative links, ADR sections, placeholders
and milestone scope. These checks are not application tests.

## Intended tooling and coverage
Vitest is the unit/integration candidate; Playwright the end-to-end candidate.
Neither is installed. Future verification should cover:
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
