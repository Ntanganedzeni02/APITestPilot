# Product experience

TestPilot uses a restrained green accent, neutral light/dark surfaces and a shared
workspace shell. The design is presentation only: authorization, stored facts,
review decisions, AI admission and execution policy remain authoritative.

## Route inventory

| Routes                                                              | Presentation                                                                                                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                 | Project overview, assistant preview entry, recorded quality, scoped metrics, planning/evidence progress, next steps and recent loaded activity |
| `/ask`                                                              | Disabled conversational preview; real navigation to project knowledge; grounding/control drawer                                                |
| `/settings`                                                         | Current workspace/project context, appearance and links to existing execution controls; no secret editor                                       |
| `/projects`, `/projects/new`, `/workspaces/new`, `/onboarding`      | Shared project cards, setup surfaces and existing tenant forms                                                                                 |
| `/api-map`                                                          | Shared header, endpoint explorer, graph and specification tabs, compact details and preserved import history                                   |
| `/requirements`, `/risks`                                           | Shared analysis header, summary cards, collapsible filters, compact proposal and explicit review workflows                                     |
| `/tests` (including plan/scenario/case/coverage/traceability views) | Shared header, distinct generation options, plan history, filters and compact review cards                                                     |
| `/runs`                                                             | Search within loaded history, compact status rows, optional execution context, preserved safety alerts, explicit target/preview controls       |
| `/investigations`, `/investigations/[investigationId]`              | Searchable loaded records, readable follow-ups, collapsed proposals/provenance and preserved authorization actions                             |
| `/findings`, `/findings/[findingId]`                                | Searchable findings, status/severity badges, optional technical traceability, recorded evidence and human review                               |
| `/memory`, `/memory/[factId]`, `/memory/evidence/[observationId]`   | Scoped memory filters, compact observations, readable references and optional exact provenance                                                 |
| `/quality`                                                          | Dimension cards, optional source/provenance and immutable history                                                                              |
| `/releases`, `/releases/[releaseId]`                                | Release cards, assessment summaries, expandable policy signals, evidence links, human decisions and historical snapshots                       |
| `/reports`, `/reports/[reportId]`                                   | Report cards, preserved immutable report scope/decision, summary assessment and unchanged JSON export                                          |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`          | Shared appearance, typography and form surfaces; unchanged auth actions                                                                        |
| Loading, error and not-found views                                  | Consistent loading surfaces and honest retry guidance                                                                                          |

## Reusable presentation

`components/ui/product.tsx` provides PageHeader, Card, Metric, StatusBadge,
EmptyState, Progress and Disclosure. Existing Button, accessible modal Sheet,
FiltersPanel, LocalTime and specification TechnicalDetails remain shared.
DetailDrawer uses Radix focus trapping, Escape/dismissal and focus restoration.
SearchableList searches only authorized records already loaded for the page; its
counts explicitly exclude unloaded pagination. QueryFilters preserves Memory's
GET field values and environment scope; clearing resets pagination, not tenancy.

Missing or historical quality never becomes a current perfect score. Dashboard
counts identify their loaded analysis, plan or run scope. Recent activity is a
summary of loaded imports/plans/runs, not a complete audit log. Source/assessment
read failures are shown as unavailable, not proof of absent evidence.

## Explicit limitations

Conversational AI has no connected backend. Its composer and Send action are
disabled; nothing is submitted, persisted or sent to a provider. Prompt cards
are ordinary navigation links. Existing AI-assisted workflows are separate and
remain governed by their existing feature flags, budgets and human review.

This redesign adds no automatic review, refresh, execution, release decision or
provider request. Technical identities remain internal to links/forms and are
available in optional provenance views. Date formatting remains browser-local
with the existing hydration-safe initial rendering strategy.

Responsive classes, native keyboard controls and Radix modal semantics are
covered by offline rendering/interaction checks. Full authenticated desktop and
mobile browser acceptance must still exercise real navigation and review flows;
static rendering tests are not a substitute for that acceptance.

Signed-out Chromium checks at 1440px and 390px verified the sign-in surface
without horizontal overflow. These used an isolated browser profile; no user
authentication session or hosted data was modified. Authenticated page screenshots
and full keyboard acceptance remain outstanding.
