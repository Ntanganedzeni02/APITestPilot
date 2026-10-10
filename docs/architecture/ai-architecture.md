# AI architecture

Status: provider-independent proposal contracts retain structured validation and
failure isolation. M1.12.3 adds an opt-in server-only official OpenAI adapter for
planning and bounded investigation proposals. Live provider acceptance remains
unverified; all other intended AI responsibilities below remain unimplemented.

TestPilot-owned interfaces separate reasoning responsibilities from provider
adapters. Domain/application contracts determine accepted meaning.
See [ADR 0004](../adr/0004-provider-independent-ai.md).

## Intended workflows

Context Builder selects scoped sanitized knowledge. Behaviour Modeler proposes
system relationships. Risk Analyzer assesses risks. Test Planner organizes
coverage; Test Generator proposes structured cases. Response Analyzer interprets
sanitized observations. Curiosity Engine forms hypotheses and proposes bounded
follow-ups. Finding Classifier proposes evidence classifications. Release
Intelligence explains scores, changes and recommendations.
These are responsibilities, not freely communicating autonomous agents.

## Acceptance and authority

LLM -> structured output -> schema validation -> application/domain validation
-> accepted domain object. Reject invalid outputs before trusted persistence.
Retain sources, confidence and uncertainty; unsupported assumptions remain
inferences. Provider structured-output features do not replace domain validation.

External descriptions, examples, documents, HTTP headers/bodies, errors and
generated API content are untrusted data. Context construction must separate
them from trusted instructions; source content never automatically gains authority.

AI must not control the HTTP client, execute arbitrary requests, generated shell
commands or arbitrary code, bypass policy, modify secrets, automatically confirm
defects without evidence/policy, or decide releases.
Exclude secrets unless explicitly required by a future reviewed design.
Follow-up proposals re-enter validation, review and deterministic policy.
See [execution](execution-engine.md) and [security](security.md).

## Implemented M1.5 proposal boundary

QaIntelligenceProvider is vendor independent and currently unconfigured. The
initial bounded context contains only graph types and opaque citation tokens,
omitting free-text specifications, identifiers, URLs and credentials. Strict
structured output validation maps tokens to the selected immutable source and
rejects unknown fields, categories, ownership, evidence and approval attempts.
Only concise public reasons/questions and validated provider/prompt metadata are
retained. Timeout or invalid output leaves deterministic analysis available.
See [M1.5 trust boundary](../development/qa-intelligence.md).

M1.6 extends the provider-independent abstraction with opaque approved-requirement/risk/graph catalogs and strict non-executable planning proposals. Deterministic planning survives provider failure. No provider is configured. See [planning trust boundary](../development/test-planning.md).

## M1.12.3 integration update

Opt-in server-only OpenAI reasoning is now implemented for planning and bounded
investigation hypotheses; earlier no-provider statements describe the original
milestone. Actual finding interpretation remains deferred. Migration
`20261008001200_ai_reasoning.sql` adds the RLS-protected usage ledger and two
authenticated admission/completion RPCs; it is not deployed. Hosted alignment
remains through 01100. See [configuration and authority limits](../development/openai-reasoning.md).
