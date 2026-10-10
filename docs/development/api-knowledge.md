# M1.3 API knowledge imports

## Supported inputs and lifecycle

Paste JSON/YAML or upload `.json`, `.yaml`, `.yml` UTF-8 files. OpenAPI 3.0.x and
3.1.x are supported. Swagger 2.0 and other versions return explicit errors.
Syntax, structural OpenAPI, reference and semantic validation precede normalization
and one atomic persistence call. Select a project, open API Map, choose paste/file
mode in the Imports tab and validate/import. API Map separates Endpoints,
Behaviour Graph, Schemas & Security and Imports. Import selection applies
immediately and retains its ID and active tab in the URL. History lists the latest
50 authorized imports; an unavailable selected import never falls back silently.
Endpoint search covers method, path, summary and tags, with method filters and
declared-tag or stored inferred-resource grouping. Structured details preserve
parameter requirements, media types, responses and security OR/AND alternatives.
Dates use the browser timezone with UTC originals retained for audit.

The graph uses persisted facts, with directional edges, declared/inferred styling,
filters, highlighted connections, keyboard navigation, zoom, pan and an accessible
paginated list. The default view focuses on the first operation and its immediate
stored relationships; Full graph restores the bounded overview. The inspection
panel stays alongside the map, with full relationship provenance available. The visual
preview is capped at 120 nodes and 400 edges; the list retains all matching nodes.
Focus on a selected node to inspect its neighborhood. Graph schema nodes and
imported component schemas remain separate counts. Raw JSON, source pointers,
UUIDs and provenance remain in collapsed technical details, loaded on expansion.
Browsing never executes APIs, calls AI or rebuilds graphs automatically. Every re-import creates a distinct UUID; history is never
overwritten.

Limits: 2 MiB UTF-8 input, 50,000 structural nodes, nesting depth 64 and 2,000
operations. Client feedback supplements authoritative server checks. Server Action
requests allow 3 MiB for multipart overhead. MIME is not trusted; extension and
content are validated. YAML aliases/custom tags and duplicate JSON/YAML keys fail.

Normalized model version 1 includes API metadata, OpenAPI version, servers/tags,
components/schema metadata, security schemes/global requirements and operations.
Operations include stable method/path keys, operationId, descriptions, tags,
deprecation, merged path/operation parameters, request bodies, response status/
media types, effective servers/security and provenance pointers. Domain invariants
are checked again when persistence returns data. Vendor types stay in api-spec.

## References and credential policy

Only root-local JSON pointers such as `#/components/schemas/Item` are supported.
Broken pointers fail, including unused components. Recursive schema references
are retained; cyclic non-schema chains fail. Remote/file/relative references,
anchors, `$id` and dynamic reference scopes are unsupported. No imported URL is
fetched. JSON Schema instance validation is outside this milestone.

Remove credentials before import. Server URLs with user information, query strings
or fragments fail. Examples/defaults/vendor extensions are stripped before storage
and display. Free-text metadata still requires user review. No raw input is logged;
errors expose categories and structural pointers without stack traces or provider
details. Imported descriptions are escaped plain text, never instructions/code.

## Persistence and deployment

`20261006000200_api_knowledge.sql` adds `api_imports` and `import_api_spec`; M1.2
SQL is unchanged. Each row stores workspace/project, derived actor/time,
format/filename/byte count, original-input SHA-256 fingerprint, sanitized source
JSONB and normalized JSONB. Reads use membership RLS. The creation RPC checks
membership/project independently, with a composite FK and restricted grants.
Normal workflows use authenticated publishable-key access, never service-role.

Both migrations are deployed to Development Supabase, based on authenticated
PowerShell status evidence supplied on 2026-10-06: local and remote versions match
`20261006000100` and `20261006000200`. This verification did not query remote
migration history or apply migrations. Hosted authenticated import verification
is deferred because no authenticated session is available. Do not reset the
hosted database or reapply migrations. Hosted auth acceptance remains partially deferred
due to development email limits; M1.3 does not change Auth/SMTP.

## Verification

Unit fixtures exercise parsing/errors, inheritance, security overrides, bodies/
responses, local/recursive references, rejection, sanitization, upload orchestration
and authorization/failure behavior. Provider fixtures are not live RLS evidence.

On a fresh disposable vanilla PostgreSQL compatibility database, apply in order:
`supabase/tests/postgres-bootstrap.sql`, M1.2 migration, M1.3 migration, then
`supabase/tests/tenancy.sql` and `supabase/tests/api-knowledge.sql`. The bootstrap
emulates Auth roles/claim lookup and must never run on Supabase. Tests roll back
fixture records and exercise actual constraints, RLS, grants and transactions.

Local browser verification used the production ImportForm/KnowledgeView components,
real parser/orchestration, and real disposable PostgreSQL import RPC persistence.
The harness clearly labels its emulated auth context. It does not prove Next.js
sessions, hosted Supabase or PostgREST. Desktop/mobile checks covered empty state,
paste JSON, upload YAML, errors, operation details, keyboard focus and overflow.

Before M1.4, complete the deferred authenticated imports,
history selection, refresh and cross-tenant attempts against Supabase. No AI,
Behaviour Graph, generation, API execution, findings or quality scores exist yet.
