# Development setup

M0.3 completes pnpm/TypeScript workspace boundaries and GitHub Actions CI alongside
the existing ESLint, Prettier and Vitest tooling.
M1.1 adds the Next.js shell; M1.2 adds Supabase identity, tenancy and projects.
Live functionality requires a configured Supabase instance.
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
The root .env.example contains public-key placeholders and the local APP_ORIGIN; copy it to root .env.local and
populate it privately using the Supabase setup below.

Workspace globs cover `apps/*`, `workers/*` and `packages/*`. All nine package
directories and workers/api-runner now have private manifests, strict TypeScript
configs. Domain/database now implement M1.2; other packages remain empty. The root plus these ten boundaries form eleven
workspace projects. M1.1 adds @testpilot/web, making twelve projects including
the root. Web declares framework/UI and Supabase dependencies; database depends
on Supabase JS and domain. Root owns shared
engineering tools and the Next lint plugin; web owns its React types and CSS tools.

Each boundary supports build, typecheck and lint. For example:

```sh
pnpm --filter @testpilot/domain build
pnpm --filter @testpilot/api-runner typecheck
pnpm -r lint
```

Root lint scans all repository source; root typecheck checks tooling and every
workspace; root test includes tooling, domain and application/adapter contract tests.

## Web application

M1.3 adds deterministic OpenAPI imports and API Map. See
[API knowledge setup and limits](api-knowledge.md). Both migrations are deployed to
Development Supabase per supplied status evidence; development commands do not apply migrations.
Build both api-spec and database dependency closures before web-only development
on a fresh checkout. Root build/typecheck builds them in dependency order.

```sh
pnpm --filter @testpilot/web dev
pnpm --filter @testpilot/web typecheck
pnpm --filter @testpilot/web test
pnpm --filter @testpilot/web build
pnpm --filter @testpilot/web start
```

Development and production servers bind to 127.0.0.1:3000. Run build before start.
Build/checks do not require credentials. Auth and protected workflows do. Root
pnpm build includes the web production build. Build workspace dependencies before
running web alone on a fresh checkout (`pnpm --filter @testpilot/database... build`).
Root/web typecheck builds domain/database dependencies before checking declarations;
web then runs next typegen before TypeScript, so a fresh checkout needs no cached dist.
Next-generated next-env.d.ts, .next and compiler caches are ignored.
Local system fonts avoid network font downloads during production builds.

Routes: `/`, `/api-map`, `/requirements`, `/risks`, `/tests`, `/runs`,
`/investigations`, `/findings`, `/releases`, `/reports`, `/ask`, `/memory`, `/settings`.
These future QA areas still show honest empty states. M1.2 adds real /projects,
/projects/new, /onboarding and /workspaces/new. Product/setup routes require auth.
/login, /signup, /forgot-password and /reset-password use the separate auth layout.
Light/dark/system theme preference is stored locally.

## Supabase setup

For the full local stack, install the supported Supabase CLI and Docker using
[the official guide](https://supabase.com/docs/guides/local-development/cli/getting-started).
The tracked supabase/config.toml configures PostgreSQL 17, email confirmation and
local mail capture. From the repository root, on a disposable development stack:

```sh
supabase start
supabase db reset
```

Reset recreates the local database and applies tracked migrations. Do not run it
against an existing database containing wanted data. The hosted development migration was applied and verified manually by the project owner; local Docker verification is a separate workflow.

Set root .env.local using the three variable names in .env.example:

| Variable                             | Purpose                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Your Supabase API origin (local stack or hosted project)                                    |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Publishable key, or legacy anon key for local CLI; never a secret/service-role key          |
| APP_ORIGIN                           | Server-only canonical web origin; use http://127.0.0.1:3000 locally and HTTPS in production |

No privileged application key is required. Config validates origins and rejects
privileged public-key assignments. Missing/invalid config disables auth forms and
redirects protected routes to a setup explanation on /login. Restart after changes.

For a hosted development Supabase project, review its target before linking the
CLI (`supabase link --project-ref <development-project-ref>`) and apply reviewed
migrations with `supabase db push --linked`. No hosted changes were made by M1.2.
All schema changes belong in migrations; do not substitute manual dashboard SQL.

Configure hosted Auth Site URL to APP_ORIGIN and allow exactly these URLs at that
origin: /auth/callback, /auth/callback?next=/reset-password, /auth/confirm. Enable
email/password signup, email confirmation and a minimum 12-character password.
Choose production SMTP and provider rate limits before public use. Copy the
tracked confirmation/recovery templates from supabase/templates to the matching
hosted Auth templates. They use .SiteURL, .TokenHash and fixed signup/recovery
types, so verification can complete without a same-browser PKCE verifier. The
/auth/callback route also supports the default PKCE confirmation flow; default
PKCE recovery links require the initiating browser. No OAuth provider is configured.
See [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
and [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

After verification/sign-in, users without a workspace enter onboarding. Workspace
creation establishes OWNER membership and proceeds to first-project creation.
Existing workspace members go directly to Overview and can select existing projects
or create another. Project creation atomically creates all three logical environments.
No API URLs, credentials, secrets or imported specifications are stored.

Database types use runtime-validated adapter contracts; no generated file is
claimed or hand-edited. If introducing generated types later, reproduce them from
the migrated local schema with `supabase gen types typescript --local --schema public`
and review drift. Domain must remain provider independent.

Supabase auth-js 2.117.2 has a declaration incompatibility with TypeScript 6 DOM
toJSON. pnpm automatically applies the tracked declaration-only patch during
install; strict checking remains enabled. See ADR 0005 for the exact change and
removal condition. No runtime auth behavior is patched.

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

## Hosted M1.2 live authentication checklist

The web Next.js configuration loads root `.env.local` as a fallback using Node 24's
native environment loader. Shell/deployment variables and Next's already-loaded
app-local variables take precedence. No values are logged or copied into tracked
files. Only `NEXT_PUBLIC_` variables may be included in browser bundles; keep
`APP_ORIGIN` server-only. Missing root files are allowed for CI/deployment.
This root fallback is literal dotenv configuration: do not use variable expansion.
Restart the server after changing environment configuration.

Normal development start from the repository root:

```sh
pnpm --filter @testpilot/web dev --port 3000
```

On this Windows host, select the existing toolchain once per PowerShell session:

```powershell
$env:PATH = "$PWD\.tools\node-v24.21.0-win-x64;$PWD\.tools\bootstrap\node_modules\.bin;$env:PATH"
pnpm.cmd --filter @testpilot/web dev --port 3000
```

The development migration has already been applied and its local/remote timestamp
was verified manually by the project owner. Do not reapply or reset it for Auth tests.
Before creating a user in the hosted development Dashboard:

1. Set Auth Site URL to `http://127.0.0.1:3000` and add the three exact redirect
   URLs listed above. Enable email/password signup, Confirm Email and a minimum
   password length of 12; disable anonymous sign-ins.
2. Copy `supabase/templates/confirmation.html` into **Confirm signup**, subject
   **Verify your TestPilot account**. Copy `supabase/templates/recovery.html` into
   **Reset password**, subject **Reset your TestPilot password**. Local template
   files and database migrations do not update hosted Auth settings/templates.
   These links use `.SiteURL`, `.TokenHash`, and fixed `signup`/`recovery` types;
   `/auth/confirm` verifies the token server-side before choosing a fixed destination.
3. Ensure email delivery: default Supabase SMTP restricts recipients to project
   organization team addresses; configure custom SMTP for other test addresses.
   Review sending limits and disable email-provider link tracking when applicable.
4. Start the app and open `http://127.0.0.1:3000/signup`. Then manually verify
   signup/email confirmation, protected-route access, logout/login, forgot password,
   recovery confirmation and password reset. Automated provider fixtures are not
   evidence of successful live authentication.

Web typecheck/build use canonical `.next/types` generated by `next typegen`/build;
`.next/dev` is excluded from TypeScript checks to avoid duplicate generated
declarations after a development session. Next agent-file generation is disabled
to preserve the repository's engineering instructions.
