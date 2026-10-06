# 0003: Separate API runner

## Status
Accepted architectural direction for M0.1; implementation pending.

## Context
API execution requires secrets, safety controls and operational behavior distinct from web request serving.

## Decision
Separate workers/api-runner from apps/web. A future queue carries validated authorized execution plans for a constrained DSL.

## Alternatives considered
Execution in web handlers; AI-controlled HTTP execution.

## Consequences
Execution can have separate deployment and restricted privileges. Queue contracts and authorization propagation require future design. No runner or queue is implemented.
