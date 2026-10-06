# 0002: PostgreSQL Behaviour Graph storage

## Status

Accepted architectural direction for M0.1; implementation pending.

## Context

Graph relationships coexist with relational tenant-owned QA knowledge and evidence. No workload measurements exist.

## Decision

Use PostgreSQL nodes/edges initially, retaining provenance, confidence and verification. Add Neo4j only through a future justified ADR.

## Alternatives considered

Neo4j initially; document-only storage.

## Consequences

Avoid an additional datastore initially. Complex traversals may require query/index design and later evaluation. No database, schema or benchmark exists.
