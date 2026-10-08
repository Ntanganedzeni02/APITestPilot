# ADR 0013: Evidence-scoped release assessments and human decisions

Status: accepted and implemented for M1.11. Migration `20261007001000_release_intelligence_reports.sql` is deployed; local/remote histories align through 01000 and hosted catalog/function verification passed with no blocking defects. Local concurrency tests passed; authenticated hosted browser acceptance and hosted concurrency were not exercised. M1.12 hardening is in progress; 01100 is deployed and local/remote migrations align through 01100.

## Decision

Reuse existing project/environment/import identity, M1.10 immutable quality scoring and M1.8/M1.9 authority. A pure versioned release policy consumes scoped safe references and closed states, producing BLOCKED/INSUFFICIENT_EVIDENCE/CAUTION/CLEAR. It never authorizes a release or HTTP execution. Human OWNER/ADMIN decisions are a separate append-only history, with explicit accepted-risk rationale and stale-state protection.

Use five small relations with membership reads and narrowly scoped RPC writes. Store signals inside immutable structured assessments rather than a duplicate signal authority table. Snapshot exact assessment/decision content into release-report-v1 so historical reports never depend on mutable current findings or heads. Project/release locks, expected decision identity and unique fingerprints enforce independent-session safety. Existing runner capabilities remain unchanged.

## Consequences

Quality arithmetic is reused, not forked. Domain/SQL release policy requires maintained parity vectors. UTC freshness buckets and timestamp serialization preserve clock-sensitive identity. Reports use source import IDs and safe references instead of copying untrusted specification prose/payloads. Explicit refresh and human risk acceptance remain visible; no CI/CD orchestration, AI final decision, code-diff inference or PDF engine exists. See [exact policy and verification](../development/release-intelligence-reports.md).
