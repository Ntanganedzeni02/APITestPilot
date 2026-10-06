# Development setup

M0.3 completes pnpm/TypeScript workspace boundaries and GitHub Actions CI alongside
the existing ESLint, Prettier and Vitest tooling.
M1.1 adds the Next.js web shell. No backend, credentials or application environment
variables exist; no authentication or project creation is implemented.
Read [AGENTS](../../AGENTS.md) and [architecture](../architecture/overview.md).

## Prerequisites

Use Node 24 LTS; .nvmrc pins 24.21.0 and engines require the 24.x line.
Install pnpm 12.9.1, pinned in packageManager:

```sh
npm install --global pnpm@12.9.1
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

On Windows use npm.cmd and pnpm.cmd if PowerShell blocks .ps1 wrappers.
Do not change execution policy merely to run package commands.
Commit pnpm-lock.yaml; use pnpm install --frozen-lockfile for reproducible installs.
pnpm format writes formatting changes. pnpm build compiles all ten workspace
boundaries into ignored dist directories and builds the web app into .next.
There is still no functioning API runner.
No .env.example is needed because no variables are defined.

Workspace globs cover `apps/*`, `workers/*` and `packages/*`. All nine package
directories and workers/api-runner now have private manifests, strict TypeScript
configs and empty source exports. The root plus these ten boundaries form eleven
workspace projects. M1.1 adds @testpilot/web, making twelve projects including
the root. Only web declares framework/UI runtime dependencies. Root owns shared
engineering tools and the Next lint plugin; web owns its React types and CSS tools.

Each boundary supports build, typecheck and lint. For example:

```sh
pnpm --filter @testpilot/domain build
pnpm --filter @testpilot/api-runner typecheck
pnpm -r lint
```

Root lint scans all repository source; root typecheck checks tooling and every
workspace; root test runs meaningful tooling checks without invented package tests.

## Web application

```sh
pnpm --filter @testpilot/web dev
pnpm --filter @testpilot/web typecheck
pnpm --filter @testpilot/web test
pnpm --filter @testpilot/web build
pnpm --filter @testpilot/web start
```

Development and production servers bind to 127.0.0.1:3000. Run build before start.
No credentials are needed. Root pnpm build includes the web production build.
Web typecheck runs next typegen before TypeScript so it works on a fresh checkout.
Next-generated next-env.d.ts, .next and compiler caches are ignored.
Local system fonts avoid network font downloads during production builds.

Routes: `/`, `/api-map`, `/requirements`, `/risks`, `/tests`, `/runs`,
`/investigations`, `/findings`, `/releases`, `/reports`, `/ask`, `/memory`, `/settings`.
These are navigation and empty-state views, not functional product workflows.
The shell has no access control; do not treat its appearance as authenticated access.
Project creation is disabled. Light/dark/system theme preference is stored locally.

## CI

The [workflow](../../.github/workflows/ci.yml) runs on pull requests and pushes to
the existing master branch. It reads Node from .nvmrc and pnpm from packageManager,
uses frozen-lockfile installation and runs lint, typecheck, tests, formatting and
workspace build. Actions are pinned to full commit hashes; credentials are not
persisted by checkout and permissions are contents: read. pnpm's setup action
caches its store using the lockfile. No deployment, application secrets or services
are configured. A hosted run requires the user to publish the reviewed repository
to GitHub and enable Actions; M0.3 does not configure a remote or push.

pnpm's release-age policy uses version-specific exceptions for the selected
typescript-eslint 8.71.1 release family and seven version-specific Radix primitives
selected in M1.1. `minimumReleaseAgeStrict` requires an
explicit decision for future exceptions instead of adding them automatically.

Validation on this Windows host uses ignored .tools/ for a local Node/pnpm
bootstrap because system Node is 22.16.0. This is machine-local, not a tracked
artifact or required setup path. Normal development uses the versions above on PATH.
