# Development setup

M0.2 configures pnpm workspaces, strict TypeScript, ESLint, Prettier and Vitest.
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
```

On Windows use npm.cmd and pnpm.cmd if PowerShell blocks .ps1 wrappers.
Do not change execution policy merely to run package commands.
Commit pnpm-lock.yaml; use pnpm install --frozen-lockfile for reproducible installs.
pnpm format writes formatting changes. There is no application start/build script.
No .env.example is needed because no variables are defined.

Workspace globs cover `apps/*`, `workers/*` and `packages/*`. These directories remain
placeholders until a scoped milestone adds manifests and code. The private root
owns engineering dependencies.

pnpm's release-age policy uses version-specific exceptions for the selected
typescript-eslint 8.71.1 release family. `minimumReleaseAgeStrict` requires an
explicit decision for future exceptions instead of adding them automatically.

Validation on this Windows host uses ignored .tools/ for a local Node/pnpm
bootstrap because system Node is 22.16.0. This is machine-local, not a tracked
artifact or required setup path. Normal development uses the versions above on PATH.
