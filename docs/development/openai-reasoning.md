# Bounded OpenAI reasoning (M1.12.3)

The official OpenAI SDK uses the Responses API with strict JSON-schema Structured
Outputs, `store: false`, no tools, no redirects and no automatic retries. The
server-only export is separate from provider-neutral domain contracts.

## Configuration

Set server-only `OPENAI_AI_ENABLED=true`, `OPENAI_API_KEY` and
`OPENAI_MODEL=gpt-4.1-mini` in the root ignored `.env.local` for development, or
the web platform secret store in deployment. The default flag is false; disabled,
missing-key and invalid-key states make no outbound request. Never prefix these
variables with `NEXT_PUBLIC_`. Runner configuration does not require OpenAI.
The priced model allowlist also accepts `gpt-4.1-mini-2025-04-14`.

Migration `20261008001200_ai_reasoning.sql` is deployed per supplied evidence; hosted histories align through 01200. Retry migration `20261008001300_ai_retry.sql` is local and undeployed. Review and deploy 013 separately before live retry verification; missing accounting infrastructure fails closed. No paid OpenAI calls
were made during implementation. Mocked SDK calls do not prove live connectivity.

## Admission and accounting

Authenticated workspace membership and project/source/anchor scope are checked
before admission. Each request reserves 12,000 input and 4,000 output tokens and
11,200 micro-USD, using conservative un-cached mini pricing ($0.40 input / $1.60 output per million tokens). Pricing/model changes require a reviewed update to these ceilings. Daily UTC limits are
20 requests / 224,000 micro-USD per workspace, 10 per project and 10 per actor.
A rolling 120-second window admits at most two workspace requests and one project
request, even if a client settles a receipt early. Requests have a 25-second
provider timeout. Identical workflow/anchor/model/context hashes are deduplicated per project while reserved, successful or uncertain. After migration 013, terminal RATE_LIMIT (429), PROVIDER_TRANSIENT (explicit 5xx) and PRE_SEND (confirmed DNS/connection-establishment failure) permit a new attempt after the rolling cooldown and a fresh budget check. Each attempt reserves the full allowance; no automatic retry occurs. Timeout, reset, canceled delivery, lost acknowledgment and legacy ambiguous PROVIDER/NETWORK receipts remain blocked for that fingerprint. Their original liability is never assumed refunded. Failed or interrupted requests retain their full reservation; actual
usage never refunds admission capacity. Unsettled requests age out of concurrency
slots but remain charged against the daily ceiling.

The ledger stores scope, model, hashes, timing, token counts, safe error codes and
response IDs, never keys, prompts, completions or raw provider errors. Missing
usage is explicitly estimated/uncertain. Clients cannot read receipt nonces or
write the table. Two authenticated RPCs admit and atomically persist the validated
proposal plus receipt. Browser-supplied usage is accounting metadata, never trusted
execution evidence, and cannot increase budgets. Existing runner authority remains
exactly five execution RPCs.

## Grounding and authority

Test Studio's **Generate with AI** requires approved requirements and the current
source/graph/analysis. Context contains bounded operation tokens, declared schema
constraints and approved requirement/risk categories. Descriptions, examples,
defaults, observed payloads, headers, credentials and literal enum values are
omitted. Recognizable credentials, URLs and email addresses are withheld. This
conservative structural reduction does not establish arbitrary-secret detection
or business semantics. Unknown references, invented explicit HTTP statuses and
unsafe execution fields are rejected. Accepted proposals retain source pointers,
AI provenance, review-only request intent and non-executable preconditions.

Investigations' **Generate AI hypotheses** operates only on existing eligible
cases and evidence references, within existing investigation budgets. It does not
create arbitrary requests or resolve unavailable resource-ID provenance.

Observation/Evidence -> Investigation -> Hypothesis -> Follow-up Proposal ->
Validation -> Human/Policy Authorization -> M1.7 Execution -> M1.8 Evidence/Findings.

Both paths retain explicit human review; planning review does not authorize HTTP.
Provider failures return safe UI errors rather than simulated AI success. Existing
deterministic generation remains separately available. No AI release decisions,
graph inference, unrestricted exploration or actual finding interpretation was
added.

## Verification

On a clean checkout, `pnpm typecheck` builds the shared packages used by integration fixtures before `pnpm test`, matching CI.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`,
`pnpm build` and `pnpm verify:database` with the documented local PostgreSQL
configuration. Provider calls are mocked; database assertions and independent
session races use disposable local databases. PostgreSQL 17 CI execution, hosted
AI acceptance, Docker runtime and production launch remain unverified.

References: [official SDK](https://developers.openai.com/api/docs/libraries),
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[priced model](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

## Retry migration deployment order

Keep `OPENAI_AI_ENABLED=false` on every web instance and let existing AI calls
finish before the change. Apply 013 before deploying the retry application code:
012 rejects the new `PROVIDER_TRANSIENT` and `PRE_SEND` receipt codes. Deploying
code first can leave a failed reconciliation as an unsettled, charged reservation.
The old 012 application remains compatible with 013; its ambiguous legacy
`PROVIDER` failures deliberately remain protected from retry.

Schedule a brief AI maintenance window for the transactional constraint/index
replacement. PostgreSQL takes table locks and builds the replacement index before
commit; lock duration depends on ledger size and concurrent transactions. There
is no externally visible interval without fingerprint protection. Verify the
new index, admission function permissions and unchanged five runner RPCs after
migration, then deploy the application with AI still disabled. Do not retry the
migration manually after a successful application: migration history records it
once. Hosted PostgreSQL 17 verification and separately authorized live acceptance
remain required before enabling AI.

## Controlled live acceptance prerequisites

After focused security review and authorized deployment of 013, use a legitimate
authenticated development session with current imported knowledge and approved
requirements. Configure the server key/model, confirm provider credits and
workspace budgets, and explicitly authorize a bounded paid verification before
enabling the feature. Review the generated proposal and its provenance; do not
confuse a successful provider response with execution evidence. Keep the feature
disabled until those prerequisites are satisfied.
