# ADR 0006: Immutable API knowledge imports

Status: accepted for M1.3. Date: 2026-10-06.

An import is one immutable tenant-scoped `api_imports` row containing source
metadata, a sanitized source document and versioned normalized knowledge.
Each import gets a UUID/time, including identical re-imports. The latest import
is displayed by default and prior versions remain inspectable.

Operations have stable `METHOD path` keys within an import; their full identity
is `(import ID, operation key)`. JSON pointers preserve source provenance.
Schemas retain references, including recursion, instead of expanded cyclic
objects. Future graphs/tests can derive records linked to these identities.
Those features are not implemented now.

Domain owns contracts/invariants; api-spec owns deterministic validation and
normalization; database owns authenticated persistence; web orchestrates imports.
Vendor types stay inside api-spec. Pinned YAML/OpenAPI JSON schemas validate
input without a resolver that can fetch files or URLs.

One row makes an import atomic without a table per OpenAPI object. The RPC derives
the actor, locks/checks membership and project scope, and inserts once. A composite
FK independently enforces project/workspace association. RLS controls reads;
direct mutations are revoked. Authorized members may import, consistent with M1.2.

Tradeoffs: JSONB is sufficient for bounded imports. The UI lists the latest 50;
older imports remain stored. Large histories may later require summary pagination
and separate detail reads. Examples, defaults and vendor extensions are omitted
to reduce credential retention. A SHA-256 fingerprint identifies original bytes;
the stored source is sanitized provenance, not a byte-for-byte archive. Users must
still remove credentials from free text. No general secret detector is claimed.
