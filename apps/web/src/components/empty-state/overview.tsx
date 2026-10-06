import {
  ArrowRight,
  Check,
  CodeXml,
  FileCode2,
  FolderPlus,
  Layers,
  ListChecks,
} from 'lucide-react';
import { Button } from '../ui/button';
import Link from 'next/link';

const futureViews = [
  {
    title: 'API Quality Score',
    detail: 'An explainable assessment grounded in verified test evidence.',
    note: 'Not assessed',
  },
  {
    title: 'Quality dimensions',
    detail:
      'Contract, function, workflow, security, performance and regression.',
    note: 'Awaiting evidence',
  },
  {
    title: 'Release confidence',
    detail: 'Traceable recommendations. The final decision stays with you.',
    note: 'No release',
  },
  {
    title: 'Latest test run',
    detail: 'Results, assertions and real HTTP evidence in one place.',
    note: 'No runs',
  },
  {
    title: 'Findings requiring attention',
    detail: 'Observations and potential defects with clear provenance.',
    note: 'Not investigated',
  },
  {
    title: 'API & workflow coverage',
    detail: 'See which behaviours are verified and where gaps remain.',
    note: 'Not measured',
  },
];

export function Overview({
  projectName,
  createHref = '/projects/new',
}: {
  projectName?: string | undefined;
  createHref?: string;
}) {
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Your release picture</p>
          <h1 className="page-title">Overview</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Understand what you can trust. Know what still needs evidence.
          </p>
        </div>
        <span className="mt-1 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground" />
          {projectName
            ? 'Awaiting verified QA evidence'
            : 'Awaiting project setup'}
        </span>
      </div>

      <section
        aria-labelledby="onboarding-title"
        className="grid overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-[1.3fr_1fr]"
      >
        <div className="p-7 sm:p-9">
          <div className="mb-6 flex size-11 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <CodeXml className="size-5" aria-hidden="true" />
          </div>
          <h2
            id="onboarding-title"
            className="text-2xl font-semibold tracking-tight"
          >
            {projectName
              ? `Your project: ${projectName}`
              : 'Start with your first project.'}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {projectName
              ? 'Your project is ready. Open API Map to import or inspect its API specifications.'
              : 'Give your API a home for its specification, test plans and evidence.'}{' '}
            Your release picture will take shape here as verified results become
            available.
          </p>
          <div className="mt-6">
            {projectName ? (
              <Button asChild aria-describedby="create-project-note">
                <Link href="/api-map">
                  <FileCode2 aria-hidden="true" />
                  Open API Map
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href={createHref}>
                  <FolderPlus aria-hidden="true" />
                  Create a project
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            )}
            <p
              id="create-project-note"
              className="mt-3 text-xs text-muted-foreground"
            >
              {projectName
                ? 'Import OpenAPI JSON or YAML to build real API knowledge.'
                : 'Create a real project with development, staging and production environments.'}
            </p>
          </div>
        </div>
        <div className="border-t border-border bg-muted/35 p-7 sm:p-9 lg:border-l lg:border-t-0">
          <p className="eyebrow">How TestPilot will work</p>
          <ol className="mt-6 space-y-6">
            {[
              {
                icon: FileCode2,
                title: 'Understand your API',
                detail: 'Start from your specification and intended behaviour.',
              },
              {
                icon: ListChecks,
                title: 'Review the test plan',
                detail: 'Keep execution deliberate, approved and policy-bound.',
              },
              {
                icon: Layers,
                title: 'Build an evidence trail',
                detail: 'Connect results to findings and release decisions.',
              },
            ].map(({ icon: Icon, title, detail }) => (
              <li key={title} className="flex gap-3.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground">
                  <Icon
                    className="size-4"
                    aria-hidden="true"
                    strokeWidth={1.6}
                  />
                </span>
                <div>
                  <h3 className="text-[13px] font-medium">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="future-views-title" className="mt-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h2 id="future-views-title" className="text-sm font-semibold">
            What will appear here
          </h2>
          <span className="text-xs text-muted-foreground">
            Available after project setup and execution
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {futureViews.map((view) => (
            <article
              key={view.title}
              className="rounded-lg border border-border bg-surface p-5"
            >
              <h3 className="text-[13px] font-medium">{view.title}</h3>
              <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">
                {view.detail}
              </p>
              <p className="mt-5 flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                <span className="font-mono">—</span>
                {view.note}
              </p>
            </article>
          ))}
        </div>
      </section>
      <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        No results are shown until there is real evidence to support them.
      </p>
    </div>
  );
}
