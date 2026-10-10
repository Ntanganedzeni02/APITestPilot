# ADR 0015: Bounded server-only OpenAI reasoning

Status: accepted for local implementation; migration 012 deployment pending.

Keep provider-neutral contracts in the AI package and the official SDK behind its
server-only export. Use strict Responses output followed by application/domain
validation, grounded opaque references and explicit human review. No provider
receives HTTP execution tools or runner credentials.

Durable authenticated admission reserves worst-case usage before network calls.
Workspace advisory locks serialize budgets; a rolling reservation window prevents
early settlement from bypassing concurrency limits. Failed requests do not refund
capacity. Atomic completion couples proposal persistence and safe accounting.
Fixed priced model limits trade flexibility for explainable cost ceilings.

No provider call was made during implementation. This does not establish hosted
AI operational readiness or launch readiness. See the OpenAI reasoning runbook.
