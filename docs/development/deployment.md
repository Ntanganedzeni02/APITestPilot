# Deployment and configuration foundations (M1.12.1)

This prepares deployment; it does not launch TestPilot. Migrations 00100 through 01000 are immutable and deployed to Development. No 01100 is introduced. Claim recovery, health/heartbeat and monitoring implementation belong to M1.12.2. Until those gates and end-to-end acceptance pass, do not invite external users or enable production API execution.

## Runtime and builds

Use Node 24 and pnpm 12.9.1 from your machine/CI environment. `.tools` is not a deployment dependency. The committed lockfile and Supabase patch are required.

```sh
pnpm install --frozen-lockfile
pnpm --filter @testpilot/web... build
pnpm --filter @testpilot/api-runner... build
pnpm preflight build
```

The trailing `...` selects workspace dependencies in build order. No dist directories must exist before installation/build. Do not regenerate the lockfile during deployment.

## Web (Vercel or managed Next.js)

Select `apps/web` as the Vercel root, enable source files outside the root directory, and use Node 24. `apps/web/vercel.json` explicitly invokes pnpm 12.9.1 through npx for both frozen installation at the workspace root and the web dependency build. This avoids depending on Vercel's preinstalled pnpm version or a Corepack setting. Next.js manages the application output. Keep server actions server-side and configure the three web variables below in each deployment environment. Do not copy `.env.local` to the host or inject runner variables into web deployment configuration. Shell/platform settings take precedence over the optional root development env file.

Configure the HTTPS domain/TLS and exact APP_ORIGIN before Auth acceptance. Preview deployments must use a separate staging project/origin and intentional Auth redirect allowlist; do not share production secrets with arbitrary branch previews. No Vercel project has been connected by this package.

## Runner container

From the repository root:

```sh
docker build -f workers/api-runner/Dockerfile -t testpilot-runner:<commit> .
docker run --init --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --memory 256m --cpus 1 --stop-timeout 30 --env-file <protected-runner-env-file> testpilot-runner:<commit>
```

The multi-stage Node 24.21.0 image installs pinned pnpm, builds only the runner dependency closure and deploys production workspace dependencies. The deploy-only allowUnusedPatches option permits omission of the web-only Supabase patch, which is not in the runner dependency graph; the full frozen installation still applies the patch strictly. Runtime uses the non-root node user and `node dist/main.js`. No web server or credentials are embedded. Treat resource values as initial bounds to validate under load, not proven capacity. Prefer platform-managed secret injection over an env file. Apply egress restrictions and keep the service isolated from private networks/metadata services; database HTTPS access and approved synthetic/API targets require deliberate rules.

SIGTERM stops new claims; the current request can finish within its existing timeout. This is compatibility, not a complete drain/recovery implementation. There is intentionally no fake Docker health check: process liveness is not proof of queue progress. M1.12.2 must implement operational health and stranded-claim recovery before launch. No automatic network retries are introduced.

## Environment matrix

| SaaS deployment | Supabase                     | Web origin                  | Runner and API targets                                                |
| --------------- | ---------------------------- | --------------------------- | --------------------------------------------------------------------- |
| Development     | Existing Development project | Local loopback HTTP allowed | Dedicated development token; controlled test APIs                     |
| Staging         | Separate staging project     | Fixed HTTPS staging domain  | Separate credential; controlled synthetic APIs only during acceptance |
| Production      | Separate production project  | Production HTTPS domain     | Separate short-lived credential; restrictive reviewed target policy   |

These SaaS environments are distinct from a customer's logical DEVELOPMENT/STAGING/PRODUCTION API environments stored in TestPilot.

Web: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are public configuration; APP_ORIGIN is server-only. Production rejects HTTP including loopback. The existing cookie/redirect safeguards remain unchanged.

Runner: RUNNER_SUPABASE_URL must be a clean HTTPS origin; RUNNER_SUPABASE_PUBLISHABLE_KEY must be a publishable/anon key; RUNNER_DATABASE_TOKEN must have role=testpilot_runner. Production requires a future integer JWT expiry. Startup validation does not verify JWT signatures; Supabase/PostgREST does. Do not provide service-role credentials or a JWT signing key to the worker. Errors disclose no supplied values.

## Preflight

```sh
pnpm preflight build
pnpm preflight web
pnpm preflight runner
pnpm preflight migrations
pnpm verify:database <psql-executable>
```

Set the component's deployment variables before its configuration preflight. In development only, component preflight may load root `.env.local`; production never does. Configuration checks do not contact Supabase. Build preflight verifies exact toolchain and frozen install, then builds both components. Migration preflight checks only local inventory, not remote state.

Database verification is destructive only to newly created disposable fixture databases at 127.0.0.1:55433, never hosted targets. It bootstraps Supabase-compatible roles, installs pg_stat_statements, applies all migrations and runs the maintained SQL assertions, five concurrency harnesses and both parity harnesses. It requires PostgreSQL 17 by default. `--allow-pg15` explicitly permits local compatibility checks but leaves PG17 grant assertions deferred; CI never supplies that flag. Build domain first for parity scripts. Fixture databases are retained for local diagnosis; the CI service is disposable. Failures exit nonzero.

## PostgreSQL CI

The existing quality job remains. A separate PostgreSQL 17 service job builds domain and invokes the same database entrypoint, with ON_ERROR_STOP and independent-session concurrency checks. It uses only a disposable fixture password, no Supabase secret or hosted URL. Required branch protection must include both jobs. Docker/CI execution needs external runners; source configuration alone is not a successful CI run.

## Supabase and secrets checklist (manual, not executed)

1. Provision separate staging/production projects and confirm database version, access controls and backup plan. Rehearse restore to a separate project; document RPO/RTO.
2. Review all immutable migrations and role provisioning. From the intended linked deployment workspace use pinned CLI: `pnpm dlx supabase@2.119.0 link --project-ref <ref>`, `pnpm dlx supabase@2.119.0 migration list --linked`, and only after authorization `pnpm dlx supabase@2.119.0 db push --dry-run` followed by `pnpm dlx supabase@2.119.0 db push`. Verify histories and catalogs afterward. Never run local bootstrap/test fixtures against hosted Supabase.
3. Set Site URL to the exact HTTPS APP_ORIGIN; allow `/auth/callback`, `/auth/callback?next=/reset-password` and `/auth/confirm` at that origin. Avoid broad wildcards.
4. Enable email/password, confirmation and 12-character passwords; disable anonymous signup. Configure custom SMTP, sender DNS and appropriate Auth rate limits/CAPTCHA. Test confirmation/recovery in the real browser. Local templates do not update hosted templates: copy confirmation/recovery templates into their matching Dashboard slots.
5. Verify the dedicated runner role still has exactly five RPCs and no table access. Have the authorized platform administrator issue a signed, short-lived runner token through a reviewed issuer process. Signature algorithm/key compatibility must be verified against the selected Supabase project; do not invent an unverified signing command. Store only the resulting role token in the worker secret store, never the signing secret.
6. Scope deployment credentials and secret access by component/environment. Rotate runner tokens before expiry via platform secrets and a controlled worker restart. Token renewal and safe drain remain M1.12.2 work.
7. For exposure: disable execution admission, stop affected workers, revoke/rotate through the platform's supported credential mechanism, verify old tokens fail, redeploy clean artifacts and inspect audit evidence. Changing a deployment secret does not itself revoke an already issued JWT; project-level revocation/signing-key changes require an assessed blast radius. Do not expand runner privileges as a workaround.

## Deployment and rollback sequence

Prepare staging infrastructure -> verify backups/Auth/configuration -> authorized migration deployment and catalog verification -> deploy web -> deploy restricted runner -> operational health and controlled synthetic smoke -> end-to-end acceptance. Production launch requires subsequent M1.12 packages and explicit authorization. No production target tests are performed here.

Use immutable image/commit tags and retain previous web/worker artifacts. On rollback stop new submissions if necessary, stop/drain the worker, restore previous compatible artifacts and verify configuration/auth/queue state. Already-sent requests cannot be undone by rolling back code. Do not replay ambiguous executions or reverse evidence/history migrations; use reviewed forward fixes and a tested restore procedure for genuine disaster recovery. A previous app version must remain compatible with the deployed database.

External steps: hosting projects, domain/DNS/TLS, SMTP/provider credentials, production/staging Supabase, backup/restore rehearsal, token issuer, restricted network deployment, CI branch protection and operational acceptance cannot be completed by repository files alone.
