import Link from 'next/link';
import { PageHeader, Card, EmptyState } from '../ui/product';
export function Overview({
  projectName,
  createHref = '/projects/new',
}: {
  projectName?: string;
  createHref?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Welcome to TestPilot"
        description="Understand your API, shape a deliberate plan and build an evidence trail."
      />
      <EmptyState
        title={
          projectName ? `Your project: ${projectName}` : 'Create a real project'
        }
        description={
          projectName
            ? 'Your project is ready. Import a specification to begin. Quality remains unknown until there is real evidence.'
            : 'A project brings your specification, requirements, plans and evidence together.'
        }
        href={projectName ? '/api-map' : createHref}
        action={projectName ? 'Open API Map' : 'Create project'}
      />
      <Card title="What will appear here">
        <p className="text-sm text-muted-foreground">
          A compact view of quality, confidence, evidence sufficiency and
          pending reviews. No results are shown until there is real evidence to
          support them.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ['Understand your API', '/api-map'],
            ['Review the plan', '/tests'],
            ['Inspect evidence', '/runs'],
          ].map(([label, href]) => (
            <Link className="button-link" key={href} href={href!}>
              {label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
