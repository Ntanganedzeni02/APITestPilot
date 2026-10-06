# Security and multi-tenancy

Status: permanent requirements for future implementation. Documentation alone
does not implement these controls.

## Untrusted content

OpenAPI descriptions, Swagger examples, uploaded documentation, HTTP bodies,
headers, API errors and generated API content are untrusted data.
They must never automatically become AI or execution instructions.
Separate source content from trusted policy and validate model outputs at schema
and application/domain boundaries.

AI has no execution authority. Deterministic policy controls approved structured
tests. Production defaults to restrictive behavior; investigations remain
bounded by environment scope, approvals and budgets.

## Tenant authorization

Authenticate callers and establish authorized workspace membership/project access
on the server. Never trust browser-supplied workspace_id as proof.
Enforce scope across reads/writes, queue jobs, runner operations, evidence,
exports, AI context and memory. Prevent cross-tenant references and unauthorized
identity/secret reuse. Future schema design must address database enforcement
as well as application checks; no RLS configuration exists today.

## Secrets and evidence

Encrypt secrets and restrict access to authorized server/runner components.
Secrets must never appear in source control, client bundles, logs, ordinary
evidence, errors or analytics. Never log environment variables containing secrets.
Exclude secrets from AI prompts unless explicitly required and permitted by a
future reviewed design.

Redact sensitive values before normal logging, AI processing, display, export
and standard evidence persistence. URLs, headers and bodies may all carry secrets.
Avoid ordinary capture paths that persist raw sensitive payloads before redaction.
Retention, key management and exceptional raw-evidence access require future design.

## Future security design

HTTP execution must authorize targets and address SSRF, unsafe redirects and
internal/metadata-service access. Concrete protections are not configured.
Audit approvals, authorization and human decisions without leaking secrets.
Verification must cover tenant isolation, prompt injection, policy bypass and
redaction. See [testing](../development/testing.md).
