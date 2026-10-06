# 0001: Monorepo architecture

## Status

Accepted in M0.1. Workspace tooling established in M0.2; product packages pending.

## Context

Web, execution and reusable capabilities need coordinated development with clear boundaries.

## Decision

Use apps/web, workers/api-runner and focused packages in a monorepo. Preserve presentation -> application -> domain dependencies.

## Alternatives considered

One all-in-one web application; separate repositories per component.

## Consequences

Changes and documentation remain together. Package discipline and future dependency enforcement are required. M0.2 configures pnpm workspace discovery; architectural directories remain placeholders without package implementations.
