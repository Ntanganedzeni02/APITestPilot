# AI validation diagnostics

Validation failures retain the ledger error category VALIDATION and its existing
accounting/deduplication policy. Server logs now emit AI_VALIDATION_REJECTED with
an admitted attempt ID, validation stage, stable code/rule, reference category
and rejectionCount. Validation stops at the first failure; the count is one,
not a claim that all rejected proposals were enumerated. Unknown internal errors
use a fixed fallback rule and never log exception messages.

Stages: INPUT bounds/credential exclusion; PARSE output bounds/JSON;
SCHEMA runtime output shape; REFERENCE_MAPPING opaque catalog references and
scenario associations; GROUNDING supplied operations/requirements, safe content,
duplicate objectives and declared status codes; PLAN final plan acceptance;
PERSISTENCE result reconciliation. Persistence failures remain USAGE_UNCERTAIN,
not retryable validation errors. Diagnostics contain no prompts, response bodies,
rejected values, credentials or user identities. Restrict server log access and
retain logs according to deployment policy. No migration is required.

The structural schema is deliberately broader than semantic validation.
Grounding requires 1?10 proposals and supplied references on scenarios as well
as cases. The prompt now explicitly states these existing requirements, unique
keys, scenario-before-case ordering, non-empty fields and case-type consistency.
Schema, grounding, budgets and execution authority are not relaxed.

Earlier failed attempts cannot be diagnosed retroactively because only their
usage receipts and generic VALIDATION code were saved. Local tests use clearly
synthetic fixtures, not reconstructions of the three paid responses. A new live
attempt requires explicit authorization and successful existing admission;
identical-context VALIDATION failures remain deduplicated. Do not alter old
records or change hashes merely to bypass this protection. This diagnostic
release alone does not prove the earlier failures were corrected.

## Offline pipeline repair and verification

Two deterministic contract gaps were repaired: objective bounds now reserve
space for the appended request intent, and cases must cite requirements present
on their parent scenario. Mapping reports SCENARIO_REQUIREMENT_SCOPE before
final plan validation. No text is truncated and no grounding rule is relaxed.
The AI action returns its saved plan ID and exact analysis ID for navigation.
These fixes are not proof of the historical failures' root cause.

After shared package builds, run the explicitly synthetic, network-intercepted
SDK-to-database harness with Node 24 and a disposable local PostgreSQL service:

```powershell
node --conditions=react-server tooling/verify-ai-planning-pipeline.mjs 'C:/Program Files/PostgreSQL/15/bin/psql.exe' 55434
```

It uses loopback only, fake provider credentials confined to the child process,
three distinct model-shaped fixture responses and actual authenticated SQL persistence/RLS.
No OpenAI call is sent. Each project readback verifies two pending non-executable proposals,
exact analysis identity and settled token usage. Separate component tests check
scenario/case display with the existing AI origin filter.

Use ai-planning-eligibility.sql in an authenticated Supabase SQL Editor for
sanitized admission facts. Supply the current actor UUID, not credentials.
A context hash must come from the actual authorized application catalog,
never an arbitrary replacement. Zero attempts for an analysis establishes no
prior fingerprint; other analyses may need exact-context inspection. Capacity
is only a read-only snapshot; the normal atomic admission RPC still decides.

Prefer an existing genuinely eligible approved analysis. If there is a genuine
need for a new analysis, use Requirements > Create analysis for the current
specification, review its generated requirements and approve appropriate items,
then select that analysis in Test Studio. Do not create an artificial analysis,
change reviews or fabricate a hash solely to evade failed-context deduplication.
For the resulting plan, use Test Studio Filters > Origin > AI proposed to see
its review-only scenarios and cases. Never treat this as execution authorization.

See [multi-project acceptance](multi-project-ai-acceptance.md) for the independent
project harness, inline-response repair and remaining real-provider/browser checks.
