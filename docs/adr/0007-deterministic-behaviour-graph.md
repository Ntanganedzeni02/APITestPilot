# ADR 0007: deterministic immutable behaviour graphs

Status: accepted for M1.4. Date: 2026-10-06.

## Decision

An explicit Build Behaviour Graph action derives a graph from one immutable
persisted import. A rebuild creates a new snapshot; failures leave the import
and previous graphs intact. Graph model/builder versions are stored separately
from snapshot UUIDs. No timestamps or random values participate in logical IDs.

Domain owns contracts/invariants. behaviour-graph owns the pure builder, rule
catalog and queries. Database owns the Supabase adapter. Web orchestration loads
an authorized import, builds/validates it, then calls the persistence contract.
api-spec continues to own parsing/normalization, without graph reasoning.

Use normalized PostgreSQL snapshots/nodes/edges with scope and endpoint composite
foreign keys, independent membership RLS and a single atomic restricted RPC.
Graphs are immutable for ordinary application roles. Privileged database owners
remain able to perform reviewed maintenance. No graph database or new external
dependency is needed.

Conservative deterministic rules can omit plausible relationships. This is
preferable to representing guesses as facts. Inferred CRUD and identifier edges
describe specification intent/compatibility, never successful runtime execution.
State values do not establish transitions or operation preconditions. Future AI
hypotheses will need separate contracts/authority and must not replace these facts.

## Consequences

Explicit builds make failure/rebuild history understandable. UI shows the latest
snapshot for the selected import, ordered by creation time then UUID; history is
retained in PostgreSQL without a full snapshot-history selector in this milestone.
The existing API Map import selector is bounded to the latest 50 imports.

JSON provenance preserves rule/source evidence, while normalized graph records
support relational constraints and future queries. A private provenance validator
and RPC endpoint checks protect storage. The RPC validates structure/scope, not
the truth of arbitrary client-supplied semantic claims; the normal application
always invokes the deterministic builder. Graph data is never execution authority.

The migration was separately reviewed and deployed to Development Supabase,
according to supplied authenticated migration-status evidence.
Hosted Auth acceptance remains a separate deferred dependency.
