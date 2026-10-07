# ADR 0011: Bounded evidence-grounded curiosity

Status: Accepted and implemented for M1.9. Migration
`20261007000800_curiosity_engine.sql` is deployed; local and hosted migrations
are aligned through 00800. M1.9 post-deployment verification passed.
M1.10 Evidence Memory + API Quality Intelligence is implemented locally; 00900 is undeployed. M1.11 has not started; 01000 does not exist.
Actual AI-provider integration remains deferred.

## Decision

Reuse pinned approved test cases, graph scope, M1.7 safety/transport and M1.8 evidence.
Four normalized tables preserve investigations, immutable proposal payloads, citations
and attributed audits. Lock investigation roots for quota/approval/materialization.
All executable follow-ups require exact human proposal review; M1.7 independently
evaluates network policy and binds its own execution approval. A private proposal gate
revalidates execution provenance, environment, lifecycle and budgets before the preserved
M1.7 request implementation. Generated snapshots cannot use the ordinary public request
path; shared ordinary cases remain unaffected. Runner grants stay fixed.
Provider-neutral structured proposals have no executable request or authority fields.

## Consequences

Only declared-assertion repeatability is an evidence-concludable hypothesis initially.
Safe observed binding is limited to persisted HTTP status and declared numeric status
query parameters. Redacted resource identifiers cannot be reconstructed; unresolved
stateful dependencies remain blocked. This intentionally favors proven provenance over
broad exploration. No AI provider is required or simulated. Memory and release
intelligence remain outside M1.9.
