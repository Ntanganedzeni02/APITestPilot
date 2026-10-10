# First Vercel Preview checklist

This is preparation, not deployment or hosted verification.

## Source control

Stage reviewed source under `apps`, `packages`, `workers`, `tooling`, `supabase`
and `docs`, plus reviewed root configuration, lockfile, README and `.env.example`.
Include new AI modules, UI components, tests and migrations 01200–01400; the current
committed revision does not include those untracked implementations. Review
`git status --short --untracked-files=all` and `git diff` before staging. Do not
stage ignored files using force. Examples must contain placeholders only.

Keep `.env.local`, `.env.runner.local`, other secret env files, `.tools`,
`node_modules`, `.next`, `dist`, logs, coverage, Supabase `.temp`/`.branches`,
generated Next type declarations and TypeScript build caches ignored.

## Vercel

Use root `apps/web`, framework Next.js, Node 24.x and enable source files outside
the root. Keep Next.js output defaults. Existing `vercel.json` commands install
pnpm 12.9.1 frozen at the monorepo root and build `@testpilot/web...` dependencies.
Do not copy ignored local env files to Vercel.

Configure Preview variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `APP_ORIGIN`: exact HTTPS preview origin, no path or trailing route
- `OPENAI_API_KEY`: server-only secret
- `OPENAI_MODEL=gpt-4.1-mini`
- `OPENAI_AI_ENABLED`: deliberately enable only for authorized beta usage
- `EXECUTION_RUNNER_READY=false`

Use a stable preview domain for Auth. Do not share privileged credentials with
untrusted branch previews. Production settings require separate review.
The web app never starts the dedicated runner. The readiness flag is a manual
operator attestation, not live health detection. It defaults false and blocks
web execution requests and approvals, including forged form submissions.
It does not disable an independently running worker or replace database policy;
inspect existing queues before any future worker startup.

### Runs troubleshooting

Keep `EXECUTION_RUNNER_READY=false` until operational acceptance passes. A missing
value also disables requests and approvals; this server gate ignores browser form
values. Cancellation and existing history remain available. Check the exact
deployment commit and environment scope when UI and server behavior disagree.

Execution RPC failures now report safe categories: permission, planning eligibility,
target configuration, missing database functions/schema cache, concurrent state
changes or database failure. `EXECUTION_ACTION_REJECTED` logs only the category,
never database messages, credentials or request contents. A saved action does not
prove HTTP execution. Use persisted observed results to establish execution.

## Hosted verification (administrator, read-only)

Run in the selected development project's SQL Editor:

```sql
begin transaction read only;
select version, count(*) as recorded_count
from supabase_migrations.schema_migrations
group by version order by version;
select p.oid::regprocedure as signature, p.prosecdef, p.proconfig,
       pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('testpilot_runner',p.oid,'EXECUTE') as runner_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and
      (p.proname ilike '%bulk%' or p.proname ilike '%ai_reasoning%')
order by p.oid::regprocedure::text;
select p.oid::regprocedure as runner_rpc
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and has_function_privilege('testpilot_runner',p.oid,'EXECUTE')
order by 1;
rollback;
```

Confirm each local version 00100–01400 exists exactly once, including
`20261009001400`. Catalog signatures/grants must match the reviewed migrations;
history alone does not prove definitions or permissions. Do not apply a missing
migration without separate authorization. Expect exactly five runner RPCs.

## Auth and acceptance

Set hosted Site URL to the exact preview HTTPS origin. Allow that origin's
`/auth/callback`, `/auth/callback?next=/reset-password` and `/auth/confirm`.
Copy repository confirmation and recovery HTML into the corresponding hosted
email templates; local files do not configure hosted templates. Preserve enabled
email confirmation and the existing password policy. Test signup, confirmation,
login and recovery manually on the preview domain before inviting beta users.

Verify real import, project-specific requirements, review and saved plans using
normal authenticated flows. Paid AI acceptance requires explicit authorization;
do not substitute fixture responses. Execution remains unavailable for this
preview until dedicated runner credentials, queue safety and runtime acceptance
are independently established.
