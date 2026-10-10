# 0005: Supabase identity and server-owned tenant context

## Status

Accepted for M1.2 implementation. Live Supabase verification remains required.

## Decision

Use Supabase Auth, PostgreSQL and RLS. Use `@supabase/ssr` server clients with
HTTP-only cookies; no browser SDK client or privileged key is needed. Next.js
16 proxy refreshes/verifies signed claims; server operations independently call
`getUser()` and verify current membership. Never authorize through `getSession()`.
Auth routes have a separate layout from protected product routes.

Application composition lives in `apps/web/src/lib/auth` and `lib/tenancy`.
`@testpilot/database` implements the domain-owned `TenantRepository` contract.
Domain owns roles, logical environment types, name/identifier validation and the
small repository interface. It has no framework/provider imports or dependencies.

Use UUIDs as stable identifiers. Names can repeat; slugs and descriptions are
unnecessary for these workflows. Use HTTP-only, SameSite=Lax session cookies
`tp-workspace` / `tp-project` for selected context, with Secure in production.
These IDs are untrusted hints. Every request resolves them against current
membership and projects; invalid/stale context produces a generic unavailable
page with a reset-selection action. Selection actions recheck membership and
project/workspace relationships. No global state library is required. Navigation
keeps context across existing area routes. Default context selects the first
persisted workspace/project ordered by creation time and UUID. Signing in/out
clears previous selection so different accounts do not inherit it.

Bootstrap workspace + OWNER membership + audit atomically through one narrow
SECURITY DEFINER function. Create project + three environments + audit atomically
through another. Both derive actor from `auth.uid()`, use an empty search_path,
qualified object names, and grant execution only to authenticated users. The
membership helper avoids recursive membership RLS and checks only the caller.
All roles may create projects. Direct mutations, membership administration,
rename and deletion remain closed; no role-management UI or invitation exists.
No profiles, API URLs, credentials or environment secrets are needed.

Database responses are `unknown` until runtime-decoded into domain types. These
are explicitly adapter contracts, not handwritten claims of generated schema
types. SQL integration tests exercise schema/policies; adapter tests reject drift
such as missing fields or unsupported enums. Generated types can replace this
approach when generation can run reproducibly against a configured instance.

`APP_ORIGIN` is a server-only trusted absolute origin for email redirects, avoiding
browser/Host supplied callback destinations. Production requires HTTPS; local
loopback HTTP is allowed. The public key variable rejects secret keys and legacy
service-role JWTs. All auth/product responses are private and non-cacheable.

## Consequences and alternatives

Supabase is confined to infrastructure and web composition. Self-hosted auth,
browser-only auth, browser-supplied authorization, service-role CRUD and a global
client context store add unnecessary risk or complexity at this milestone.

Local PostgreSQL policy tests do not verify Supabase Auth, PostgREST or mail delivery.
Those require separate instance and end-to-end checks before production use.

## Dependency compatibility

Supabase JS 2.117.2 / SSR 0.12.7 are installed. Supabase auth-js declares a future
WebAuthn credential extending TypeScript's now-current DOM credential, with an
incompatible `toJSON` return type. The pinned pnpm patch omits only the inherited
`toJSON` before retaining Supabase's own declaration, in source and both shipped
declaration formats. No runtime JS changes, compiler weakening or passkey feature
is introduced. Recheck/remove this patch when upstream declarations are compatible.
