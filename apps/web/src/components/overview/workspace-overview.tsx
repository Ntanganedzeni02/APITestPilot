import Link from 'next/link';
import { MessagesSquare, ArrowRight } from 'lucide-react';
import type { QualityAssessment } from '@testpilot/domain';
import {
  Card,
  PageHeader,
  Metric,
  Progress,
  StatusBadge,
  EmptyState,
} from '../ui/product';
import { LocalTime } from '../ui/local-time';
export interface OverviewData {
  project: string;
  workspace: string;
  environment: string;
  current: QualityAssessment | null;
  historical: boolean;
  qualityUnavailable?: boolean;
  operations: number | null;
  requirements: number | null;
  approved: number | null;
  pending: number | null;
  runs: number | null;
  planCoverage: { covered: number; total: number } | null;
  activity: { id: string; title: string; href: string; createdAt: string }[];
  activityUnavailable: boolean;
}
export function WorkspaceOverview({ data: d }: { data: OverviewData }) {
  const quality =
    d.historical || d.qualityUnavailable ? null : d.current?.result;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Let's build confidence in ${d.project}`}
        eyebrow={`${d.workspace} / ${d.environment}`}
        description="A clear view of what is known, what needs review, and what to do next."
        actions={
          <Link className="button-link" href="/api-map">
            Open API Map
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        }
      />
      <Card className="border-primary/25">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <div className="mb-3 flex items-center gap-2">
              <MessagesSquare
                className="size-5 text-primary"
                aria-hidden="true"
              />
              <h2>Meet your API copilot</h2>
              <StatusBadge value="PREVIEW" />
            </div>
            <p className="text-sm text-muted-foreground">
              A future conversation grounded in your specification, plans and
              evidence. Conversational answers are not activated. Your existing
              workflows are ready below.
            </p>
          </div>
          <Link href="/ask" className="button-link">
            Explore assistant preview
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card
          title="API quality"
          action={
            <Link href="/quality" className="text-xs text-primary">
              View evidence details
            </Link>
          }
        >
          {quality?.overall != null ? (
            <>
              <div className="flex items-end gap-3">
                <strong className="text-4xl font-semibold tracking-tight">
                  {quality.overall}
                  <span className="text-sm text-muted-foreground"> / 100</span>
                </strong>
                <StatusBadge value={quality.status} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {quality.confidence.toLowerCase()} confidence. Evidence
                sufficiency: {quality.sufficiency}%.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-xl">
                {d.qualityUnavailable
                  ? 'Quality unavailable'
                  : 'Not enough evidence yet'}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {d.qualityUnavailable
                  ? 'The assessment or source identity could not be verified. Open quality details to retry.'
                  : d.historical
                    ? 'The API source changed. The previous assessment is historical.'
                    : 'Missing evidence is uncertainty, not a passing result.'}{' '}
                Review your plan, gather evidence, then assess quality.
              </p>
            </>
          )}
          {quality && (
            <div className="mt-4">
              <Progress
                label="Evidence sufficiency"
                value={quality.sufficiency}
                total={100}
              />
            </div>
          )}
          {d.current && (
            <p className="mt-4 text-xs text-muted-foreground">
              Snapshot assessed <LocalTime value={d.current.assessed_at} />. New
              evidence is reflected only after reassessment.
            </p>
          )}
        </Card>
        <Card title="Testing progress">
          <div className="space-y-5">
            <Progress
              label="Approved requirements in the latest source analysis"
              value={d.approved ?? 0}
              total={d.requirements ?? 0}
            />
            <Progress
              label="Requirement links in the latest matching plan"
              value={d.planCoverage?.covered ?? 0}
              total={d.planCoverage?.total ?? 0}
            />
            <Progress
              label="Recently asserted operations in the quality snapshot"
              value={quality?.inputs.testedOperations ?? 0}
              total={quality?.inputs.knownOperations ?? 0}
            />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Planning links are not execution evidence. Each row uses its own
            recorded scope.
          </p>
        </Card>
      </div>
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label="API operations"
          value={d.operations ?? 'Unavailable'}
          note="Latest imported specification"
        />
        <Metric
          label="Approved requirements"
          value={d.approved ?? 'Unavailable'}
          note="Latest source analysis"
        />
        <Metric
          label="Awaiting review"
          value={d.pending ?? 'Unavailable'}
          note="Requirements and risk proposals in that analysis"
        />
        <Metric
          label="Recent runs"
          value={d.runs ?? 'Unavailable'}
          note={`${d.environment}; within loaded run history`}
        />
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your next steps">
          <ul className="space-y-1">
            {[
              [
                '/api-map',
                'Understand your API',
                'Inspect the specification and its recorded relationships.',
              ],
              [
                '/requirements',
                'Review requirements and risks',
                'Confirm intended behavior before planning.',
              ],
              [
                '/tests',
                'Shape your test plan',
                'Review proposals; approval is separate from execution.',
              ],
              [
                '/runs',
                'Collect real evidence',
                'Select an approved case and review the safety decision.',
              ],
              [
                '/releases',
                'Make a release decision',
                'Assess current evidence. Humans retain the decision.',
              ],
            ].map(([href, title, note]) => (
              <li key={href}>
                <Link
                  href={href!}
                  className="group flex items-start justify-between gap-3 rounded-lg p-3 hover:bg-muted"
                >
                  <div>
                    <span className="font-medium">{title}</span>
                    <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                  </div>
                  <ArrowRight
                    className="mt-1 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Recent activity">
          <p className="mb-3 text-xs text-muted-foreground">
            Recent imports, plans and runs from the loaded project history; this
            is not a complete audit log.
          </p>
          {d.activityUnavailable && (
            <p role="status" className="mb-3 text-xs text-muted-foreground">
              Some activity sources could not be loaded.
            </p>
          )}
          {d.activity.length ? (
            <ul className="divide-y divide-border">
              {d.activity.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <span className="font-medium">{a.title}</span>
                    <span className="text-xs text-muted-foreground">
                      <LocalTime value={a.createdAt} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Your evidence trail starts here"
              description={
                d.activityUnavailable
                  ? 'Activity is unavailable. Open the individual areas to retry.'
                  : 'No activity appears in the loaded history. Import an API to begin.'
              }
              href="/api-map"
              action="Open API Map"
            />
          )}
        </Card>
      </div>
    </div>
  );
}
