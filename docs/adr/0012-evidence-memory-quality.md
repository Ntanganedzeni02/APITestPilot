# ADR 0012: Evidence memory and deterministic quality snapshots

Status: accepted for local M1.10 implementation; migration00900 is deployed and final hosted verification passed.

## Decision

Reuse authoritative M1.3-M1.9 records. Derive closed logical memory facts plus append-only supporting observations through explicit authenticated refresh. Preserve environment, source/version and human decision provenance. Do not persist raw evidence, arbitrary AI notes or reasoning. Use independently protected tenant reads and private deterministic SQL derivation, keeping runner capabilities unchanged.

Compute api-quality-v1 from a single persisted-state SQL snapshot; domain arithmetic constants and tests reproduce its formulas. Persist immutable structured assessments deduplicated by relevant input hash; a small current/previous head handles state cycles without overwriting history. Project locks and unique identities serialize concurrent refresh/assessment. Unknown remains explicit and score confidence is separate from the descriptive score.

## Consequences

Four small tables and a security-invoker currentness view replace any need for vector storage or a second evidence/finding system. Explicit refresh keeps existing execution/review transactions independent. UTC freshness bands are deterministic, while persisted versioned formulas preserve historical interpretation. PostgreSQL arithmetic and domain arithmetic require maintained parity validation. Capacity limits fail explicitly instead of scoring incomplete histories. Bounded provider-neutral query services prepare future Ask without adding a provider.

Quality is evidence intelligence, not release authorization. Actual AI interpretation, semantic search, unrestricted exploration and predictive scoring remain deferred. See [exact formulas and boundaries](../development/memory-quality-intelligence.md).
