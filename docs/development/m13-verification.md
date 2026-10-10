# M1.3 verification record

Date: 2026-10-06. Initial Git state clean, HEAD `36627c2`,
`feat: establish authentication and multi-tenant SaaS foundation`.
No staging, commits, hosted migration commands or M1.4 work by this verification.

## Implemented and checked

Domain knowledge contracts/invariants, bounded parser/schema validation,
authenticated database adapter, immutable import migration, import orchestration,
API Map/paste/file forms, operation inspection and history selection are present.
No Auth/SMTP changes, remote reference fetching, graph, AI or execution features.

Pinned dependencies: yaml 2.8.1, ajv 8.17.1, ajv-draft-04 1.0.0 and
@apidevtools/openapi-schemas 2.1.0. Official OpenAPI schemas are cloned before the
3.1 dynamic-reference compatibility adaptation used by APIDevTools. User schemas
remain inert metadata; no imported schema is compiled into execution logic.

Repository-local Node 24.21.0 / pnpm 12.9.1 validation:

| Check               | Result                                         |
| ------------------- | ---------------------------------------------- |
| Lint                | PASS, zero warnings                            |
| Typecheck           | PASS across all workspaces                     |
| Complete unit suite | PASS, 81 tests in 17 files (30 added for M1.3) |
| Formatting          | PASS                                           |
| Production build    | PASS, real `/api-map` route generated          |

## Database evidence

A fresh local PostgreSQL 15 compatibility cluster on loopback port 55433,
database `testpilot_m13`, received the Auth compatibility bootstrap and both
migrations. This is a disposable test database, not hosted Supabase.
The M1.3 SQL test passed 22 assertions: immutable re-import identity, persisted
row/actor, invalid/oversized input rollback, no partial rows, direct mutation
denial, two-user reads/import isolation, cross-workspace rejection, composite FK,
RLS, grants and SECURITY DEFINER search_path. The unchanged M1.2 SQL suite also
passed its 46 assertions. The SQL test transactions roll back their records.
No full Supabase/PostgreSQL 17/PostgREST assertion is inferred from this fixture.

## Browser evidence and limits

An isolated Chrome browser checked the production ImportForm and KnowledgeView
components with production CSS/parser/import orchestration in an explicitly
labelled local fixture. Persistence used the actual import RPC under the
authenticated PostgreSQL role and an emulated claim context. No hosted project
was contacted for imports, and no service-role key was used.

Checks passed: empty state; JSON/YAML mode controls; invalid-JSON alert; successful
JSON paste persisted as import 1; successful YAML upload persisted as distinct
import 2; real operation/parameter/response details; labels/keyboard focus;
1440x900 desktop and 390x844 mobile with no horizontal overflow or observed
runtime/log errors. Disposable browser fixture workspaces/projects/imports remain
in the local test database. They are labelled development fixtures, not live data.
Verification helpers live under ignored `.tools` and are not application routes.

The actual application returned 307 to `/login` for signed-out `/api-map` access.
The component harness substitutes a fixture transport for the Next Server Action;
it therefore does not prove the authenticated Next/PostgREST deployment journey.
Both migrations are now deployed to Development Supabase according to the user's
authenticated PowerShell evidence: local/remote versions match `20261006000100`
and `20261006000200`. No remote migration-history query was repeated here.
Hosted authenticated import: DEFERRED — authentication acceptance dependency.
The available isolated browser has no authenticated application session; no
authentication workaround or new user was created. Hosted API Map import,
history switching and authenticated desktop/mobile acceptance remain deferred
before M1.4. This deferred check alone does not block committing M1.3 when the
deterministic quality gates and local database/security regressions pass.

## Post-deployment regression verification

On 2026-10-06, reran lint, typecheck, all 81 tests in 17 files, format check
and production build successfully using repository-local Node 24.21.0 / pnpm
12.9.1. A separate focused parser run passed all 23 tests. Against the existing
disposable PostgreSQL 15 database, M1.3 passed 22 assertions and M1.2 passed 46;
both suites rolled back their fixture transactions. No migrations were run.

The normal `pnpm --filter @testpilot/web dev --port 3000` command started at
`http://127.0.0.1:3000`. API Map returned 307 to `/login`; login returned 200.
The isolated browser reached Sign in with no observed runtime exceptions.
This passes startup and signed-out route protection, but does not verify the
authenticated API Map page rendering or hosted import. No authenticated session
was available in that browser. The development server and local database were
stopped after verification.

Git review found expected M1.3 source/tests/documentation/dependency changes,
17 modified and 20 untracked files, no staged changes and no detected credentials,
debug logging or M1.4 functionality. Environment, linked CLI cache and local
verification helpers remain ignored. M1.2 migration is unchanged.
