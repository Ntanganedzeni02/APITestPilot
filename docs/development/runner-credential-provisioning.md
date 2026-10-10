# Runner credentials and first GET readiness

## Token issuance status

TestPilot does not include a JWT signer, issuer endpoint or token-minting command.
The runner accepts a three-part JWT with role `testpilot_runner`; production
requires an integer future `exp`. Supabase/PostgREST must independently verify
the signature and permit role switching. Local claim decoding is not authentication.
The migrations provision the NOLOGIN role and restricted authenticator membership,
not a credential. Exactly five public runner RPCs are intended.

An authorized development-project administrator must:

1. Inspect the selected project's actual JWT signing configuration, Data API
   verification configuration and approved credential-issuance documentation.
2. Establish a supported issuer that can issue the custom runner role using a
   key trusted by that project. Confirm algorithm/key compatibility and any
   issuer/audience/subject requirements. These values cannot be inferred from
   TestPilot or copied from a normal user token.
3. If an externally controlled trusted issuer/key is unavailable, establish the
   supported provisioning arrangement with the platform administrator before
   starting a worker. Do not assume managed signing private keys can be exported.
4. Issue a short-lived, dedicated runner credential and establish rotation and
   revocation procedures. Verify catalog authority before operational acceptance.
   Do not test credentials by calling claim RPCs against an unchecked queue.
5. Store only the resulting token in the protected runner environment. Never give
   the worker a signing key, service-role key or normal authenticated user's token.

No hosted signing metadata was inspected during the offline readiness correction;
there is no verified signing algorithm or issuer command for this environment.

## Local configuration

Use an ignored `.env.runner.local` or a protected platform secret store:

```dotenv
NODE_ENV=production
RUNNER_SUPABASE_URL=https://YOUR_DEVELOPMENT_PROJECT.supabase.co
RUNNER_SUPABASE_PUBLISHABLE_KEY=YOUR_PROJECT_PUBLISHABLE_KEY
RUNNER_DATABASE_TOKEN=YOUR_ADMINISTRATOR_ISSUED_SHORT_LIVED_RUNNER_TOKEN
```

The URL and publishable key must belong to the same development project. The root
web `.env.local` is not automatically loaded by the runner entrypoint. Never copy
real values into tracked examples or paste tokens into logs/chat. With Node 24:

```powershell
Set-Location C:\Users\Ntanga101\Desktop\TestPilot
$env:PATH="$PWD\.tools\node-v24.21.0-win-x64;$PWD\.tools\bootstrap\node_modules\.bin;$env:PATH"
pnpm.cmd --filter @testpilot/api-runner... build
git -c safe.directory=C:/Users/Ntanga101/Desktop/TestPilot check-ignore .env.runner.local
```

Only after credential verification, queue review and explicit execution approval:

```powershell
node --env-file=.env.runner.local workers/api-runner/dist/main.js
```

This immediately starts global queue polling, not a single-project dry run.
`/live` and `/ready` are loopback probes on port 9090. Readiness requires successful
DB contact; do not start the worker just to check credentials on an unknown queue.

## Unjustified data dependency corrected

Response-schema Standard cases previously always required APPROVED_TEST_DATA,
including parameterless unauthenticated GETs with no body. There is no input to
supply for that subset. Newly generated cases now omit that unjustified dependency
only when method is GET, there are zero parameters, no body and no declared security.
Normal requirement, scenario/case reviews, SQL admission and runner Safety still apply.

Historical plans and every explicitly stored precondition are unchanged. Generate
and review a fresh Standard plan; do not edit old records to remove dependencies.
Response cases with parameters, security or bodies retain the dependency. External
approved test-data storage/resolution is not implemented; those cases fail closed.
Existing schema-derived synthetic input cases have their own supported bounded
compiler path. No external-data approval workflow is claimed. AI cases stay
non-executable. Review approval never authorizes HTTP execution.

The GET compiler currently emits declared-status-set assertions; it does not
perform comprehensive OpenAPI response-schema validation. A completed request
must not be described as complete schema conformance based on that status check.

## Read-only hosted queue/grant inspection

Run in the authenticated development project's SQL Editor. Do not call claim,
recovery, admission or authorization RPCs for inspection.

```sql
begin transaction read only;
select p.oid::regprocedure as executable_function
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and has_function_privilege('testpilot_runner',p.oid,'EXECUTE')
order by 1;
select id,workspace_id,project_id,environment_id,status,cancel_requested,
       claim_expires_at,claim_recoveries,recovery_outcome,
       send_authorized_at is not null as send_intent_recorded
from public.execution_runs
where status in ('REQUESTED','AUTHORIZED','SAFETY_REVIEW','RUNNING','PENDING_APPROVAL')
order by created_at,id;
rollback;
```

Expected RPCs: claim_test_execution(), record_execution_safety(uuid,uuid,text,jsonb,jsonb,jsonb,text),
finish_test_execution(uuid,uuid,jsonb), execution_cancel_requested(uuid,uuid),
authorize_execution_send(uuid,uuid,text,uuid,text). Unexpected effective authority
requires administrator investigation, not broader grants. Review all projects:
REQUESTED/AUTHORIZED jobs and expired unsent claims can become execution candidates.
Queue inspection is a snapshot; control concurrent submissions during acceptance.

## First acceptance sequence

Import an independently confirmed GET specification, generate graph/analysis,
approve legitimate requirements, generate a fresh Standard plan and approve its
scenario/case. For the inputless unauthenticated subset, Runs should show a compiled
request after configuring the correct DEVELOPMENT base URL. Obtain explicit target
and single-request authorization, inspect the global queue, then start the worker.
Verify run status, real response metadata and assertions, persisted evidence,
quality and release/report provenance. No live HTTP acceptance is established by
this offline correction. Do not enqueue real work during configuration preflight.
