# ADR 0009: Immutable planning snapshots and independent review

Status: accepted for local M1.6 implementation; migration not deployed.

Plans pin an immutable QA analysis plus exact requirement review versions, because
QA originals are immutable but human decisions evolve. Creation rejects concurrent
review changes; existing plans keep their original planning intent. Scenario and
case definitions share one discriminated table with same-plan typed parent FKs,
while critical QA and graph links are relational. Reviews and audit are append-only.

Scenario approval does not implicitly approve cases. Both reviews and pinned
requirement approval are required for candidate execution eligibility. Setup
requirements block planning eligibility; Safety authorization remains a separate
future boundary. Edited/AI/human requirement prose is review-only rather than
reusing evidence-backed executable rules whose semantics may no longer apply.

This avoids a second mutable planning truth and unnecessary per-type tables, at
the cost of requiring plan regeneration after changed requirement decisions and
explicitly reviewing individual cases. No runtime execution is introduced.
