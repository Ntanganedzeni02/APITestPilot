# M1.2 implementation and verification record

Date: 2026-10-06. Implementation is present; live Supabase acceptance remains
UNVERIFIED. No M1.3 work, staging or commits were performed.

## Initial repository state

`git status --short` was empty. Branch master, HEAD
`17007eb feat: establish TestPilot web application shell`. HEAD remains unchanged.
AGENTS, product principles/journey/vision, architecture, security, conventions,
testing/setup, existing packages and web shell were reviewed before changes.

## Implemented scope

Migration: supabase/migrations/20261006000100_identity_tenancy.sql.

Five RLS tables: workspaces, workspace_members, projects, environments, audit_logs.
Three SECURITY DEFINER functions: is_workspace_member, create_workspace,
create_project. Five authenticated read policies: workspace_read, membership_read,
project_read, environment_read, audit_read. Anonymous/direct mutations are closed.
Functions have empty search_path, explicit grants and server-derived actor IDs.

Workspace creation atomically establishes OWNER membership and WORKSPACE_CREATED.
Project creation checks/locks membership and atomically creates DEVELOPMENT,
STAGING, PRODUCTION and PROJECT_CREATED. All initial roles may create projects.
Names are validated, UUIDs are stable identities, duplicate names are permitted.
No profiles, slugs, descriptions, API URLs or secrets are added speculatively.

Auth implements email/password signup/signin, signout, verification callbacks,
forgot/reset password, input validation, pending/error/success feedback, accessible
labels/autocomplete, HTTP-only SSR session handling and protected routes. Missing
configuration disables auth and closes product access. Trusted APP_ORIGIN avoids
untrusted email callback destinations. Callback token types/destinations are bounded.
Operations verify the live user and current membership; RLS is independently enforced.

Separate auth/setup/product route groups keep the product sidebar off auth pages.
New routes: /login, /signup, /forgot-password, /reset-password, /auth/confirm,
/auth/callback, /onboarding, /workspaces/new, /projects, /projects/new. Existing
Overview/area routes move into the protected product group and render dynamically.
Server-rendered context selectors use HTTP-only untrusted selection cookies;
membership/project scope is rechecked. Stale selection has a recovery action.
Overview offers real creation or shows the selected project's API-import empty
state and actual logical environments, with no invented QA results.

Domain owns real types/rules and TenantRepository. Database implements that contract;
all provider responses are runtime-decoded. These are adapter types, not pretend
generated schema types. See ADR 0005 for architecture and context decisions.

New dependencies are Supabase JS 2.117.2 and SSR 0.12.7 plus existing workspace
dependencies. A pinned declaration-only auth-js patch resolves TypeScript 6 DOM
toJSON inheritance incompatibility; no runtime behavior or compiler strictness is
changed. Root/web typecheck builds package dependencies for cold-checkout reliability;
Vitest resolves package source for independent tests.

README, overview, data model, security, setup and testing docs reflect this scope.
Supabase CLI config and confirmation/recovery email templates are tracked. Environment
example contains names only. CLI local caches are ignored. API import, execution,
AI, invitations, OAuth/SSO, billing, credentials and secret management remain absent.

## Exact local validation

Windows, workspace Node 24.21.0 and pnpm 12.9.1:

| Check                                           | Result                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| pnpm install and pnpm install --frozen-lockfile | PASS                                                                             |
| pnpm lint                                       | PASS, zero warnings                                                              |
| pnpm typecheck                                  | PASS across root/all workspaces, including without existing domain/database dist |
| pnpm test                                       | PASS: 46 tests in 11 files                                                       |
| pnpm format:check                               | PASS                                                                             |
| pnpm build                                      | PASS: workspace compilation and Next.js production build                         |
| git diff --check                                | PASS                                                                             |

Tests cover M0 compiler/package boundaries, M1.1 navigation/empty-state honesty,
domain names/IDs/roles/environments, persistence decoders, application authentication,
callback destinations, proxy protection/cache/cookie refresh and server-side
pre-RPC authorization. Auth/application provider fixtures are clearly labelled;
they are not live Auth or RLS evidence. The old unavailable-project-creation
assertion was updated to test the new real creation link; its honesty checks remain.

Initial checks caught a control-character regex lint issue, Supabase declaration
conflict and redirect-origin normalization issue; all were corrected. A browser
form check also exposed no-referrer causing Origin:null on native Chromium POSTs.
Normal pages now use strict-origin-when-cross-origin; token callbacks retain
no-referrer. Same-origin protection was retained and the browser rerun passed.

## Exact database verification

Used a new isolated PostgreSQL **15.4** cluster in ignored .tools, bound only to
127.0.0.1:55432. No existing/system database was changed. Clean-database migration
verification passed, including the final migration name and bootstrap workflow:

```sh
psql -X -q -h 127.0.0.1 -p 55432 -U postgres -d testpilot_m12_release -v ON_ERROR_STOP=1 -f supabase/tests/postgres-bootstrap.sql -f supabase/migrations/20261006000100_identity_tenancy.sql -f supabase/tests/tenancy.sql
```

Result: **46 SQL assertions passed**, with actual PostgreSQL privileges, policies,
constraints and transactions under authenticated/anon non-owner roles. Covered
owner bootstrap, authorized creation, all environments, role/name/unique/FK
constraints, forged workspace/project IDs, cross-tenant reads/creation/mutations,
environment/audit isolation, membership revocation and an injected environment
failure proving full project/environment/audit rollback. Temporarily broadened
grants prove RLS works independently of privilege denial. Fixture mutations/grants
are rolled back. Follow-up checks confirmed zero test users/projects and empty
search_path on all three definer functions.

The vanilla PostgreSQL bootstrap supplies compatibility auth.users/auth.uid and
roles. It emulates database claim context; it does **not** provide Supabase Auth,
JWT verification, PostgREST, SMTP or email delivery. This is real SQL policy
verification, not a mocked authorization layer, but full Supabase integration is
still UNVERIFIED. Tracked CLI config selects PostgreSQL 17 and has not been run.

No apps/web/.env.local, Supabase environment configuration, Supabase CLI or Docker
was available; the usual Docker binary location was also absent. No hosted
infrastructure was changed. Testing docs provide the real-Supabase SQL command
and a repeatable two-user REST/RPC/browser verification checklist.

## Browser verification

Production server on loopback with no Supabase configuration:

- All four auth routes returned 200 without the product sidebar.
- All 17 existing/new protected routes redirected signed-out requests; two unknown
  or forged paths also redirected. Callback failures stayed on the auth flow.
- Auth/product responses had private/no-store cache behavior.
- Real Chrome checked all auth pages at 1440, 768, 390 and 320px, light/dark themes,
  theme persistence, keyboard navigation, labels and password autocomplete.
- No horizontal overflow or runtime/console errors occurred in those checks;
  desktop light login and narrow dark signup screenshots were visually inspected.

A separate development-only configuration used an unavailable loopback Supabase
endpoint and non-secret fixture key. Chrome verified enabled form validation,
signup password mismatch, sanitized sign-in failure and invalid/expired reset
feedback. This fixture did not authenticate anyone or create any tenant data.
Screenshots/harness remain ignored under .tools. No accessibility compliance or
successful live identity/persisted browser journey is claimed.

## Git state and limitations

Final scope: 23 modified tracked files, two old route-entry files removed in favor
of protected-group replacements, and 44 new files (including this record).
Tracked diff: 25 files, 757 insertions and 147 deletions before this new record;
untracked additions are not included in git diff --stat. All changes are M1.2.
Nothing is staged; no commit/history change occurred. Local verification outputs,
database files, browser profiles and credentials are not included in Git changes.

Live signup/verification/signin/signout/recovery, mail delivery, session expiry,
PostgREST nested relationships and persisted onboarding/context UI remain untested.
No actual keys are stored in the example or repository. The auth-js compatibility
patch needs review/removal when upstream types support TypeScript 6. Creation audit
exists, but there is no general login/approval/release audit platform. Role changes,
rename/delete and account lifecycle operations remain out of scope.

## Acceptance criteria

PASS means demonstrated locally or directly established by the implementation.
UNVERIFIED means implemented but requiring the configured Supabase instance and/or
persisted authenticated browser journey; successful SQL checks are noted separately.
No remaining local check is FAIL.

| #   | Criterion                           | Status / evidence                                                            |
| --- | ----------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Supabase integration exists         | PASS: supported JS/SSR integration builds                                    |
| 2   | Email/password authentication       | UNVERIFIED live; provider contract tests pass                                |
| 3   | Signup                              | UNVERIFIED live; form and contract tests pass                                |
| 4   | Signin                              | UNVERIFIED live; real failure-state check passes                             |
| 5   | Signout                             | UNVERIFIED live; contract tests pass                                         |
| 6   | Password reset                      | UNVERIFIED live; validation/expired-user contract tests pass                 |
| 7   | Protected product routes            | PASS: production signed-out redirects and guard tests                        |
| 8   | Real workspaces                     | UNVERIFIED on Supabase; real PostgreSQL creation passes                      |
| 9   | Real memberships                    | UNVERIFIED on Supabase; real PostgreSQL membership passes                    |
| 10  | OWNER/ADMIN/MEMBER                  | PASS: domain and real SQL constraints/role cases                             |
| 11  | Creator becomes OWNER               | UNVERIFIED on Supabase; real SQL assertion passes                            |
| 12  | Real projects                       | UNVERIFIED on Supabase; real SQL creation passes                             |
| 13  | Real environments                   | UNVERIFIED on Supabase; real SQL persistence passes                          |
| 14  | Three default environments          | UNVERIFIED on Supabase; real SQL/atomicity assertions pass                   |
| 15  | RLS isolation                       | UNVERIFIED on Supabase; actual PostgreSQL policy assertions pass             |
| 16  | Forged IDs cannot bypass auth       | UNVERIFIED end-to-end Supabase; real SQL and server contract assertions pass |
| 17  | No client service-role secret       | PASS: no privileged key required; config rejects privileged assignment       |
| 18  | Persisted onboarding                | UNVERIFIED authenticated Supabase browser journey                            |
| 19  | Persisted workspace/project context | UNVERIFIED authenticated Supabase browser journey                            |
| 20  | Truthful real-project Overview      | UNVERIFIED persisted browser journey; rendered presentation tests pass       |
| 21  | No fake QA/product data             | PASS: no sample tenants or invented QA results                               |
| 22  | Version-controlled migrations       | PASS: migration included in change set, intentionally uncommitted            |
| 23  | Authorization/RLS tests exist       | PASS: repeatable real SQL suite plus labelled contract tests                 |
| 24  | Existing foundation/web tests       | PASS: retained intent, creation assertion updated for M1.2                   |
| 25  | Lint                                | PASS                                                                         |
| 26  | Typecheck                           | PASS, including cold dependency outputs                                      |
| 27  | Tests                               | PASS: 46 Vitest + 46 real SQL assertions                                     |
| 28  | Format check                        | PASS                                                                         |
| 29  | Production build                    | PASS                                                                         |
| 30  | Documentation                       | PASS: setup/security/model/testing/ADR/verification updated                  |
| 31  | M1.2-only Git changes               | PASS: reviewed scope, no staging/commit                                      |

## Before M1.3

Choose/provision the development Supabase instance and configure its email/redirect
settings. Run the real-Supabase SQL suite and two-user Auth/REST/browser checklist
before treating M1.2 as fully accepted. Review the initial all-role project-creation
policy and declaration compatibility patch. M1.3 scope remains a separate human
authorization; API import has not begun.
