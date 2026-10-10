# Bulk human review

Requirements, Risks and Test Studio reuse existing APPROVE, REJECT and EDIT
decisions. Request changes records per-item revised text and returns proposals
to review; it does not create an unsupported status.

Select individual pending proposals or Select All Visible. Approve All Pending
is explicitly scoped to currently displayed pending results, excluding hidden
filters and unloaded pages. Transactions are bounded to 50 items. Narrow filters
or select smaller batches when more than 50 pending records are displayed.
Selection clears on filter, search, analysis, plan, tab or revision changes and
after success. Counts and histories refresh from persisted data.

Every action requires explicit confirmation. Rejection and revision require a
reason. Revisions expose prefilled per-item fields and retain drafts when actions
change. Individual controls remain available.

## Integrity and deployment

Migration **20261009001400_bulk_review.sql is local and undeployed**. It is needed
to execute existing individual RPCs inside one atomic transaction. One
authenticated-only SECURITY DEFINER RPC uses an empty search path, bounded
payloads, caller-derived membership, explicit analysis/plan/kind scope,
deterministic locks and expected-revision comparisons. Current-source and
planning requirement snapshots are checked. Reviewed/non-pending selections
are rejected. Any failed item rolls back every review and audit event.

Existing item RPCs retain their validation and append-only review/audit authority.
No prior migration, execution flag, decision mapping, RLS policy or runner grant
is changed. Runner access to the new RPC is revoked. Missing migration reports
an actionable error; there is no sequential fallback. Unknown acknowledgments
require history inspection before another action.

Approval does not authorize execution or release. AI proposals stay
non-executable. Review/deploy 014 separately before hosted acceptance; existing
individual review paths remain available. Do not apply automatically.

## Verification and manual acceptance

Run focused tests in apps/web/src/lib/reviews and the bulk-review UI test.
The standard verify:database command includes bulk-review.sql. Run
tooling/verify-bulk-review-concurrency.mjs with the local psql executable for
independent-session races. Harnesses use disposable databases at 127.0.0.1:55433.
PG15 compatibility does not establish hosted PG17 deployment.

After separately authorized deployment:

1. On each area, filter/search and select two pending proposals. Verify hidden
   and reviewed records are excluded, including after filter/context changes.
2. Confirm approval; check each item's individual audit/review record.
3. Reject two proposals with a reason; cancel confirmation to verify no writes.
4. Request changes, edit each prefilled proposal, switch actions and back to
   verify draft retention; confirm and verify awaiting re-review.
5. Approve All Pending; verify visible scope/count before confirmation.
6. Review a selected item in a second tab; verify stale batch failure is atomic.
7. Check OWNER/ADMIN versus MEMBER, tenant boundaries and historical contexts.
   AI proposal approval must remain review-only.
8. Use keyboard Tab/Space on checkboxes and controls; check mobile layout and
   screen-reader feedback. Authenticated browser acceptance remains manual.
