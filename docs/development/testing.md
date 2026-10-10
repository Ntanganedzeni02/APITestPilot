# Testing strategy

## Current tooling

M0.2 configures Vitest with a Node environment, explicit imports and mock cleanup.
`pnpm test` runs once; `pnpm exec vitest` enables local watch mode.
The root config discovers tests in future package source/tests directories,
repository tests and tooling. M1.1 adds web navigation and rendered empty-state tests;
no API quality/execution business logic exists.
`tooling/foundation.test.ts` checks workspace/compiler contracts and verifies
that unchecked indexed access produces a compiler diagnostic. It is a tooling fixture.
No pass-with-no-tests option hides missing tests.
M0.3 adds `tooling/workspaces.test.ts` to verify expected boundaries, unique names,
consistent scripts/configuration, domain manifest independence, absence of circular
workspace dependencies and required documentation. It exercises the actual ESLint
configuration with forbidden domain imports and an allowed relative import.
These checks verify engineering architecture, not product behavior.

`pnpm lint`, `pnpm typecheck` and `pnpm format:check` validate tooling.
`pnpm build` compiles packages/runner and includes the Next.js production build.
Domain and database have M1.2 behavior; other package boundaries remain empty.
GitHub Actions runs checks with frozen-lockfile installation. Root Vitest discovers
package tests; no individual empty-package test scripts hide missing behavior.

## Web foundation verification

Web tests use the existing Node-based Vitest setup and React server rendering,
with no DOM emulator or Playwright dependency. They cover the thirteen approved
routes, group membership, active-path matching and prefix collisions, rendered
page titles/purposes, findings caveats, real project creation links, unavailable API
import, real-project Overview presentation and aria-current. The M1.1 creation
test was updated for the newly authorized functionality; its honesty checks remain.
Run them alone with `pnpm --filter @testpilot/web test`; root tests include them.

Production route responses, interactive theme persistence and mobile modal focus
behavior should also be inspected in a real browser. Automated unit checks alone
do not establish visual quality, keyboard behavior or accessibility compliance.
No browser test suite or automated accessibility audit is configured yet.

M1.1 was checked against a production server in headless Chrome at desktop,
laptop, tablet and mobile sizes (including 320px). Verification covered all
thirteen routes, unknown-route 404 handling, theme changes/persistence/system
preference, active navigation and mobile keyboard opening, focus containment,
Escape dismissal and focus restoration. Screenshots were visually inspected;
no browser runtime/console errors or horizontal overflow were observed in those
checks. This is milestone verification, not a claim of full accessibility compliance.

## M1.2 automated verification

Domain tests check roles, environment types, normalized Unicode names, bounds,
control characters and malformed IDs. Adapter decoders reject missing fields and
unsupported environment types. Auth tests validate input/config, reject privileged
keys and unsafe origins. Proxy contract tests exercise actual redirect logic,
claim failure, private caching and refresh/deletion cookies. Provider responses in
these unit tests are fixtures; these are not live authentication or RLS evidence.

### Real SQL policy integration

supabase/tests/tenancy.sql executes actual migration policies as authenticated and
anonymous non-owner roles. It creates three test-only users in a transaction,
sets request claim context exactly for each role, and rolls back all fixtures,
temporary grant changes and injected failure triggers. It covers owner bootstrap,
all three roles, project/default environments, invalid names, foreign/unique/check
constraints, unauthorized reads and writes, forged tenant IDs, audit isolation,
membership revocation and atomic failure rollback. Widened grants in the test
prove RLS blocks mutations independently of ordinary privilege denial.

On a disposable **real local Supabase** stack after applying/resetting migrations:

```sh
psql -X -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/tenancy.sql
```

Use an administrative test connection only for fixture preparation/SET ROLE;
authorization assertions run as unprivileged roles. This SQL suite does not test
JWT issuance/verification, email delivery, SSR cookies or PostgREST mappings.
The test must finish with its assertion count and ROLLBACK, not partial output.
Do not run fixture scripts against production.

For a repeatable **vanilla PostgreSQL** policy check without Docker/Supabase, use
an empty disposable database (for example testpilot_m12 on an isolated port):

```sh
psql -X -h 127.0.0.1 -p 55432 -U postgres -d testpilot_m12 -v ON_ERROR_STOP=1 -f supabase/tests/postgres-bootstrap.sql -f supabase/migrations/20261006000100_identity_tenancy.sql -f supabase/tests/tenancy.sql
```

postgres-bootstrap.sql creates compatibility auth.users/auth.uid and the two
roles only for vanilla PostgreSQL. Never run it on Supabase, which supplies these
objects. This fixture emulates claim context, not an auth server; PostgreSQL
itself executes the actual migration, privileges, RLS and transaction semantics.
It is not a substitute for full Supabase verification. The clean PostgreSQL 15
run passed 46 assertions during M1.2; full local Supabase uses PostgreSQL 17 and
remains UNVERIFIED until it is run there.

### Required configured-instance browser checks

With local Supabase/mail capture or a hosted development instance:

1. Sign up A, verify its email, sign in, create workspace and first project;
   confirm the real owner membership, audit events and three environments.
2. Sign out; protected routes redirect. Verify failed login stays on auth layout.
3. Request/reset password; check valid, expired and reused links; sign in with the
   new password and confirm the previous password fails.
4. Sign up B in a separate browser profile, create separate records; attempt A's
   workspace/project IDs through selection/create server actions and the Supabase
   REST/RPC API using B's normal user JWT. Reads must hide A, creation fail, direct
   update/delete fail and environment access be denied. Never use service-role.
5. Exercise workspace/project switching, empty workspace, additional workspace,
   stale selection recovery, and existing-user onboarding without forced recreation.
6. Reload after session expiry/refresh and sign-out; inspect Set-Cookie/private
   cache headers without recording token values. Check narrow/mobile keyboard
   controls, labels, pending/error/success states and theme persistence.

Live Auth, email, PostgREST and persisted UI journeys have not been run on this
host because no configured Supabase instance is available. SQL tests and unit
fixtures do not upgrade those criteria to PASS. CI includes unit checks/build and a disposable PostgreSQL 17 job invoking the maintained database/security, concurrency and parity suites. This does not constitute hosted browser acceptance.

## Future tooling and coverage

Vitest is installed for unit/integration testing. Playwright remains a future
end-to-end candidate and is neither installed nor configured. Future checks cover:

- Deterministic parsing, invariants, graph provenance and structured-output
  validation, including malformed/adversarial imported content.
- Policy decisions, approvals, restrictive production defaults, side effects
  and bounded investigation budgets.
- Tenant isolation across persistence, jobs, evidence, memory and AI context.
- Runner authentication/actors, extraction, dependencies, setup/cleanup,
  assertions, cancellation, timeouts, retry and flakiness behavior.
- Redaction before ordinary logging/persistence/AI/display/export boundaries.
- Human review, inspectable evidence and final defect/release authority.

Use clearly labeled fixtures and controlled test APIs. Production execution
requires explicit policy authorization. Adapter contract tests should not assume
live model responses are deterministic. Integration tests verify real boundaries;
end-to-end tests cover critical journeys once implemented.

Report checks actually run, failures and missing tools.
Apply the [definition of done](../../AGENTS.md) according to scope.
