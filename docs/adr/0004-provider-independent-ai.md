# 0004: Provider-independent AI architecture

## Status
Accepted architectural direction for M0.1; implementation pending.

## Context
Reasoning must preserve TestPilot validation and safety regardless of vendor.

## Decision
Use TestPilot-owned contracts, structured outputs and provider adapters. Require schema and application/domain validation before domain acceptance.

## Alternatives considered
Provider SDK calls throughout domain/application code; vendor orchestration as execution authority.

## Consequences
Provider changes stay localized where practical. Capabilities/errors still need adapter treatment. Grow abstractions from actual use cases. No provider, SDK or workflow exists.
