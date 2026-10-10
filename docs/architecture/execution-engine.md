# Execution engine

Status: M1.7 implements a separate deterministic worker, PostgreSQL job claims,
bounded HTTP capture and independent Safety policy. No arbitrary executable DSL,
AI runtime authority, findings or Curiosity are implemented. See
[safe execution policy](../development/safe-execution.md) and [ADR 0010](../adr/0010-safe-execution-foundation.md).

Approved structured test -> validation -> safety policy -> execution plan ->
job queue -> API runner -> real customer/test API -> response capture ->
deterministic assertions -> sanitized evidence -> response analysis.

Use a constrained executable test representation/DSL, never arbitrary
AI-generated code. The LLM must not control the HTTP client.
The runner is separate from the web application;
see [ADR 0003](../adr/0003-separate-api-runner.md).

## Future capabilities

Reusable authentication profiles, multiple actors/identities, dynamic variables,
response extraction, dependency chaining, setup/cleanup and deterministic
assertions support workflows. Retries, flakiness tracking, timeout classification,
dependency failures, controlled concurrency, rate limiting, cancellation,
safety policy enforcement, evidence capture and secret redaction support reliable
operations. Retry rules must consider mutation side effects.

## Safety and autonomy

Development, Staging and Production require explicit environment policies.
Deterministic outcomes are ALLOW, REQUIRES_APPROVAL and BLOCK; AI cannot override
them. Production defaults to restrictive behavior.
ASSISTED, CONTROLLED and AUTONOMOUS modes remain bounded by policy and
investigation budgets. Approval must cover the actual test version, environment
and scope, with authorization preserved across queue/runner boundaries.

Explicitly consider financial transactions, refunds, emails, SMS, notifications,
webhooks, deletion, external integrations and account mutations.

## Evidence

Sanitized HTTP evidence will include request method, URL, headers/body; response
status, headers/body; duration, response size, timestamp, attempt and runner
information. Redact secrets/sensitive values before normal logging, AI
processing, display, export and standard persistence.

Distinguish assertion failure, timeout, dependency failure and execution error.
Failed tests are not automatically confirmed defects. Findings reference real
evidence; humans retain confirmation authority.
See [data model](data-model.md) and [security](security.md).
