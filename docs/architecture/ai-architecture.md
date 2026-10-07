# AI architecture

Status: M1.5 implements provider-independent proposal contracts, structured
validation and failure-isolated analysis. No real provider, vendor SDK or model
integration is configured.

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
