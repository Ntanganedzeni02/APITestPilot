# ADR 0010: Safe deterministic execution through a separate worker

Status: accepted for M1.7 local implementation; deployment requires security preflight.

The first real execution boundary needs independent authorization, bounded network
I/O and immutable tenant-scoped provenance. Keep HTTP in workers/api-runner; use
PostgreSQL atomic claims rather than adding a queue service. Require independent
Safety policy even after planning approval. Immutable configuration/review bindings
and request fingerprints constrain human approval. Dedicated runner RPC authority
is isolated from normal users and has no direct table grants. The worker awaits a
one-shot trusted database authorization after DNS and immediately before connection;
this snapshot is the explicit send authorization boundary.

Use Node HTTP/HTTPS with a validated pinned DNS lookup; disable redirects/retries,
block private/internal targets and production mutations. Unsupported credentials,
dependencies and materialization remain blocked. Conservative evidence redaction
preserves bounded numerical/structural observations but withholds unknown text and
string values. Object keys are anonymized and media-type metadata uses a fixed
vocabulary. SQL independently validates persisted representations and assertion
consistency. Deterministic assertions are observations, not findings or releases.

This keeps the existing package direction and uses no additional external dependency.
Stalled claims require explicit recovery; automatic reexecution is deferred because
it could duplicate mutations. A future queue/vault/DSL expansion requires new review.
See [implementation policy](../development/safe-execution.md).
