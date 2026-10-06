# Development setup

M0.3 completes pnpm/TypeScript workspace boundaries and GitHub Actions CI alongside
the existing ESLint, Prettier and Vitest tooling.
No product application, infrastructure, credentials or environment variables exist.
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
boundaries into ignored dist directories containing JavaScript and declarations.
There is no application startup, web build or functioning runner.
No .env.example is needed because no variables are defined.

Workspace globs cover `apps/*`, `workers/*` and `packages/*`. All nine package
directories and workers/api-runner now have private manifests, strict TypeScript
configs and empty source exports. The root plus these ten boundaries form eleven
workspace projects. `apps/web` remains a placeholder until M1.1.
The private root owns tooling dependencies; no runtime dependencies are declared.

Each boundary supports build, typecheck and lint. For example:

```sh
pnpm --filter @testpilot/domain build
pnpm --filter @testpilot/api-runner typecheck
pnpm -r lint
```

Root lint scans all repository source; root typecheck checks tooling and every
workspace; root test runs meaningful tooling checks without invented package tests.

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
typescript-eslint 8.71.1 release family. `minimumReleaseAgeStrict` requires an
explicit decision for future exceptions instead of adding them automatically.

Validation on this Windows host uses ignored .tools/ for a local Node/pnpm
bootstrap because system Node is 22.16.0. This is machine-local, not a tracked
artifact or required setup path. Normal development uses the versions above on PATH.
