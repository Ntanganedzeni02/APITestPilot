# 0001: Monorepo architecture

## Status

Accepted in M0.1. Workspace tooling established in M0.2; empty package and runner
boundaries established in M0.3. Product implementation remains pending.

## Context

Web, execution and reusable capabilities need coordinated development with clear boundaries.

## Decision

Use apps/web, workers/api-runner and focused packages in a monorepo. Preserve presentation -> application -> domain dependencies.

## Alternatives considered

One all-in-one web application; separate repositories per component.

## Consequences

Changes and documentation remain together. M0.3 establishes private TypeScript
package boundaries and CI, with no runtime dependencies or product implementations.
Domain independence and workspace cycles are checked; broader layer enforcement
still requires future design. apps/web remains intentionally uninitialized.
