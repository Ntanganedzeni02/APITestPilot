# Project-independent AI planning acceptance

## Independently verified offline

The local harness creates three independent workspaces, projects and actors:
Weather observations (read-only REST), Authenticated library (path/query
parameters and bearer security, OpenAPI 3.1), and Inventory mutations
(POST/PUT with required JSON bodies). These are explicitly synthetic test data.
Only local authentication identities are seeded. Tenant-owned records use the
normal authenticated workspace/project creation, import, graph, analysis,
individual human-review, AI admission and reconciliation RPCs.

After shared package builds, with a disposable loopback PostgreSQL service:

```powershell
node --conditions=react-server tooling/verify-ai-planning-pipeline.mjs 'C:/Program Files/PostgreSQL/15/bin/psql.exe' 55434
```

The installed SDK consumes intercepted model-shaped responses; no network request
is sent. Each project must persist a scenario and case, remain pending human
review and non-executable, reconcile its own usage receipt, and retain the exact
analysis association on repository readback. Authenticated cross-workspace
reads and cross-project substitutions are rejected. The GET-readiness regression configures one synthetic target and admits then
cancels one local Standard-case request. No worker runs, HTTP is sent or execution
result is created. Component tests independently check proposal display. Each project also computes
quality UNKNOWN without a fabricated score, persists an INSUFFICIENT_EVIDENCE
release assessment and scoped report, and makes no release decision.
This does not establish hosted browser or real-provider acceptance for these APIs.

A generalization defect was reproduced with the read-only specification: inline
response schemas had graph facts but no generated response requirements. New
analyses now derive explicit response contracts from those existing facts and
source pointers. Existing analyses and historical plans remain unchanged; review
and approval are still required. No migration is needed.

## Scope and limitations

Runtime project selection uses authenticated membership and project context,
not demonstration names or identifiers. AI planning needs a current import,
graph, exact approved analysis, server-side AI configuration and atomic admission.
It does not need an Execution Base URL or runner credentials. Failed-context
fingerprints, cooldowns and usage liability remain enforced.

OpenAPI support is bounded to the parser's supported 3.0/3.1 subset and size
limits; unsupported versions, external references and unsafe reference scopes
are rejected. AI input is a sanitized structural subset, capped at 12 operations,
20 requirements, 20 risks and 8,000 serialized bytes. Large or rich supported
specifications can exceed the AI context cap; parsing success is not a promise
of whole-spec AI coverage. Descriptions, arbitrary examples and credentials are
excluded. Referenced schema detail and semantic relationships are not universally
expanded into the AI context. Accepted grounding is structured reference and
assertion validation, not proof of complete behavioral correctness.

Execution separately needs an eligible deterministic case, reviewed current
version, configured environment, explicit authorization, a correctly configured
runner and permitted public target. AI proposals remain review-only even after
approval. POST/PUT planning does not authorize HTTP mutations. Evidence,
findings, investigations, memory/quality and releases are scoped to persisted
project/environment/source identities; complete live downstream acceptance for
these three fixtures remains unperformed. Unknown quality is not a score;
findings and release decisions retain human authority.

## Remaining hosted and real-provider acceptance

1. In an authenticated development browser, create three normal projects using
   genuinely different, credential-free specifications corresponding to A/B/C.
   Do not replace or alter the existing Catalog project.
2. Import, build graph, create analysis, review and approve legitimate requirements.
   Select the exact analysis in Test Studio. Verify project switching and isolation.
3. Inspect existing admission metadata for each selected analysis. Read-only checks
   are a snapshot; normal atomic admission remains authoritative. Never fabricate
   context changes or reset fingerprints to obtain eligibility.
4. Obtain explicit authorization for one paid request per project. Submit manually
   once, with automatic retries disabled. Capture sanitized attempt diagnostics.
5. Verify the saved plan's project/analysis, pending human reviews, non-executable
   AI proposals, token usage and reconciled cost. Report failures honestly.
6. Verify downstream execution separately only after its own authorization and
   runner readiness. Do not execute write methods during planning acceptance.

No hosted writes, migrations, paid requests, deployments or commits are performed
by the offline harness. PostgreSQL 15 compatibility checks are not PostgreSQL 17
hosted execution evidence.
