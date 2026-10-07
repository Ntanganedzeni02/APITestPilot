# ADR 0008: Immutable requirements/risk analyses and append-only human review

Status: Accepted for M1.5. Date: 2026-10-07.

## Context

API knowledge and Behaviour Graph snapshots are immutable and tenant scoped.
Requirements and risk signals need inspectable evidence without promoting AI
or structural inference into facts, automatic approval or runtime findings.

## Decision

Use a focused qa-intelligence application package and pure domain contracts.
Share requirement/risk structure in normalized qa_items with a constrained kind
and category/severity rules. An analysis pins exact import/graph IDs and engine
version. Deterministic and optional validated AI proposals save atomically with
normalized evidence links and a scoped audit record. No partially saved running
analysis or later AI update is introduced; retries create another snapshot.

Preserve generated content and provenance. Human additions are labelled separately;
reviews append immutable revision records with optimistic conflict checking.
Effective status derives from review history: edit resets approval, OWNER/ADMIN
approve/reject, MEMBER can propose/edit. Enforce governance in both application
and narrow authenticated SECURITY DEFINER RPCs. All tables independently enforce
membership read RLS and deny direct writes. Existing M1.2 audit constraints stay
unchanged; intelligence audit events have their own scoped table.

AI sits behind a TestPilot-owned provider contract. Strict runtime validation and
opaque evidence mapping precede persistence. No provider is configured and no
vendor dependency is required. The initial prompt deliberately excludes imported
free text/credentials and limits itself to graph type facts. Failures preserve
deterministic proposals. Providers cannot choose tenant ownership or approval.

## Consequences

Historical source and original generated meaning remain inspectable. New analyses
and review histories consume storage; bounded paged UI/query adapters prevent
unbounded rendering. Category registries can expand only with reviewed evidence
rules. Structural signals remain proposals, not runtime proof. AI semantic context
is deliberately limited until a reviewed redaction/provider integration exists.
Full-history UI pagination, richer human requirement linking and authenticated
hosted acceptance remain explicit follow-up work. No test generation/execution or
M1.6 capability is introduced.
