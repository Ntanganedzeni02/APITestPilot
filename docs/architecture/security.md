# Security and multi-tenancy

Status: M1.2 implements authentication/tenant database controls described below.
Remaining execution, secrets and AI requirements are future controls. Local SQL
policy tests passed; live Supabase/Auth/PostgREST verification is still required.

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
identity/secret reuse. M1.2 implements RLS on workspaces, workspace_members,
projects, environments and audit_logs. SELECT requires current workspace
membership, including inherited project/environment access. No direct write
privileges or mutation policies are granted to authenticated/anonymous callers.
All initial roles may create projects; role administration is unimplemented.

Two narrow SECURITY DEFINER creation functions derive the actor from auth.uid().
Workspace creation establishes OWNER membership; project creation checks and
locks membership, creates all three environments, and writes an audit event.
Each runs atomically, has an empty search_path and fully qualified object names,
and is executable only by authenticated users. The membership helper prevents
recursive membership RLS and reveals only the caller's own authorization. Table
ownership and privileged migration connections are outside ordinary user access;
the app never uses a service-role key. Creation audit events contain IDs, event
type and timestamp only, with a composite FK preventing cross-workspace projects.

Next.js proxy refreshes/verifies signed claims with Supabase SSR. Each operation
also calls getUser() to verify a live user, then verifies membership/project scope
through the database adapter. Context cookies and form IDs are untrusted hints.
Invalid selection shows a generic unavailable page with a reset-selection action.
Auth has a separate layout; no protected shell renders to signed-out callers.
Auth tokens are HTTP-only/SameSite=Lax and Secure on HTTPS. All relevant responses
are private/no-store, including refresh/redirect responses. Next.js Server Actions
provide same-origin request protection; no public mutable API endpoint is added.

APP_ORIGIN is trusted server configuration for email redirects; production uses
HTTPS. Callback destinations are fixed onboarding or reset-password paths, never
arbitrary return URLs. Verification/reset links validate with Supabase before a
session is accepted. Password update requires a live authenticated user; it can
change only that user's password. Recovery completion requests global sign-out;
existing signed access tokens can remain valid until expiry. Ordinary sign-out
is local. Invalid/expired links and provider/database errors show sanitized copy.
Sign-up/recovery success messages avoid revealing whether an email exists.

Configure Supabase email confirmation, password policy, redirect allowlist, SMTP
and rate limits as described in setup. The current implementation depends on
provider auth rate limiting; production abuse controls need live review.

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
