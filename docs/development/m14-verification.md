# M1.4 verification record

Date: 2026-10-06. Initial Git state clean at `bda4049`,
`feat: add OpenAPI knowledge engine and API import`.
No staging, commit, hosted schema changes or M1.5 work.

## Quality gates

Repository-local Node 24.21.0 / pnpm 12.9.1:

| Check            | Result                                         |
| ---------------- | ---------------------------------------------- |
| Lint             | PASS, zero warnings                            |
| Typecheck        | PASS, all workspaces                           |
| Full tests       | PASS, 124 tests in 21 files; 43 added for M1.4 |
| Format check     | PASS                                           |
| Production build | PASS, `/api-map` route generated               |

Tests exercise graph structure, CRUD/resource inference, nested/shared schemas,
different requests/responses, identifier compatibility/multiple candidates,
dependencies, effective security/explicit OAuth capabilities, conservative states,
provenance pointers resolved against the original fixture, stable logical IDs,
Unicode/object-order determinism, validation and traversal/adjacency helpers.
Negative fixtures exclude search resources, invented login routes, currency states,
vague names, incompatible identifier types and unrelated schemas. Provider tests
check scoped adapter authorization, rejected writes and malformed/partial reads;
they are labelled test fixtures, not hosted Supabase evidence.

## Database

Fresh disposable PostgreSQL 15 database `testpilot_m14_release`, loopback 55433,
received only local bootstrap and migrations in M1.2 → M1.3 → M1.4 order.
Final SQL suites passed M1.4 44 assertions, M1.2 46, M1.3 22; fixture transactions
rolled back. M1.4 assertions cover distinct snapshot identities, complete node/
edge storage, derived actor, denied direct mutations, canonical logical identities,
typed endpoints, malformed/oversized/provenance inputs, failed saves with no
partial rows, cross-project/import/workspace rejection, independent composite FKs,
read RLS for graphs/nodes/edges, anonymous/no-caller restrictions, private validator
and safe SECURITY DEFINER search_path.

This is compatibility evidence, not hosted PostgreSQL/PostgREST/Auth evidence.
The Auth bootstrap must never run remotely. No hosted migration was applied.
Prior M1.2/M1.3 migration files are unchanged. M1.4 adds only its new migration,
including an additive scoped unique candidate key on `api_imports`.

## Browser and startup

An isolated Chrome browser used a clearly labelled ignored `.tools` fixture at
loopback port 4400 with production GraphBuildForm, GraphView, KnowledgeView,
CSS and build orchestration. It used real persisted normalized fixture knowledge,
the real deterministic builder and actual PostgreSQL creation RPC under the
authenticated role with emulated claims. Transport substitutes a local fixture
endpoint for the Next Server Action. No service-role key or real Auth user was used.

Final desktop 1440×900 and mobile 390×844 checks passed: unbuilt state, build,
summary, resource CRUD/state/identifier inspection, operation inputs/outputs and
dependencies, deterministic rule/source provenance, existing API knowledge view,
visible database rejection with zero partial snapshots, keyboard rebuild with a
distinct second snapshot, focus navigation, and no horizontal overflow or observed
blocking runtime/console errors. Persisted fixture snapshots each contain 82 nodes
and 145 edges. These are labelled development data, not runtime API evidence.
An earlier duplicate rendering of recursive schema edges was corrected and the
final browser check rerun. Inspection uses adjacency indexing, lazy expanded-node
relationships and 100-item lists rather than rendering all graph relationships.

The normal web development command started at `http://127.0.0.1:3000`.
Signed-out `/api-map` returned 307 to login, and `/login` returned 200. This
does not prove authenticated Next/PostgREST graph rendering. Verification web/
fixture servers and the local PostgreSQL cluster were stopped afterward; disposable
test databases and labelled browser fixtures remain locally under ignored tools.

## Deployment, Git and remaining verification

M1.2/M1.3/M1.4 are deployed according to supplied authenticated migration
status evidence: local/remote match `20261006000100`, `20261006000200` and
`20261006000300`. Hosted authenticated graph build is
DEFERRED — authentication acceptance dependency. No inbox access, confirmation
bypass, authentication weakening or new real user was attempted.

Final work comprises domain, behaviour-graph, database and web source/tests,
the new migration/SQL assertions, ADR/model/security/setup/verification docs,
workspace dependency links and build/typecheck configuration. No external
dependencies were added. Git has 14 modified and 16 untracked files, nothing
staged/committed. No detected credentials, debug logging, generated/temporary
artifacts or unrelated milestone functionality are included. `.tools` and
`.env.local` remain ignored.

Before M1.5: complete real authenticated graph
build/rebuild/refresh, selected-import and tenant-isolation acceptance against
hosted Supabase. See [rules, limits and omissions](behaviour-graph.md).

## Final post-deployment verification

Supplied authenticated CLI deployment evidence is authoritative: M1.2, M1.3 and
M1.4 local/remote migration versions match. No remote history query, migration
command or schema change was performed for this verification.

Reran lint, typecheck, all 124 tests in 21 files, formatting and production build:
PASS, with the test baseline unchanged. Existing local PostgreSQL assertions
passed M1.2 46, M1.3 22 and M1.4 44. Retained browser graph fixtures were excluded
inside a rollback-only transaction for the graph suite; they were restored by
rollback. A separate rollback-only negative check verified that an edge in Graph
A cannot reference a node existing only in Graph B, even with matching tenant/
import scope. No permanent test-data removal or schema modification was made.

Normal app startup passed at loopback port 3000. Signed-out `/api-map` returned
307 to login; login returned 200. One brief labelled production-component/local
RPC fixture smoke check rendered a persisted graph summary without observed
runtime/console errors. No full browser acceptance rerun was needed. No legitimate
authenticated session was available in the accessible browser, so hosted graph
build remains DEFERRED — authentication acceptance dependency.

README now distinguishes existing deterministic graph generation from absent
AI/LLM inference and speculative generation. Deployment statements were updated
to match supplied evidence. Final diff review found expected M1.4 changes, no
detected credentials/debug code/generated or temporary tracked artifacts, and no
M1.5 functionality. Prior migrations remain unchanged; only the expected third
migration is added. Git has 14 modified, 16 untracked and zero staged files.
Nothing was committed. Verification services were stopped after the smoke check.

M1.4 is ready to commit; deferred hosted authenticated acceptance remains explicit.
