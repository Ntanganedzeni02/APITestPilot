import { PageHeader } from '../../../components/ui/product';
import Link from 'next/link';
import { getTenantContext } from '../../../lib/tenancy/context';
import { selectProjectAction } from '../../../lib/tenancy/actions';
import { SubmitButton } from '../../../components/tenancy/submit-button';
import { Button } from '../../../components/ui/button';
export const metadata = { title: 'Projects' };
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projects, workspace } = await getTenantContext();
  const query = await searchParams;
  return (
    <div>
      <p className="eyebrow">{workspace?.name}</p>
      <PageHeader
        title="Your projects"
        description="One workspace for your specification, deliberate plans and evidence."
      />
      <p className="mt-3 text-sm text-muted-foreground">
        Select a project to open its overview.
      </p>
      <div className="mt-6">
        <Button asChild>
          <Link href="/projects/new">Create project</Link>
        </Button>
      </div>
      {query['notice'] === 'unavailable' && (
        <p role="alert" className="mt-4 text-sm">
          This resource is unavailable. Choose a project you can access.
        </p>
      )}
      {projects.length ? (
        <ul className="mt-7 grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id} className="product-card">
              <h2 className="break-words font-medium">{project.name}</h2>
              <form action={selectProjectAction} className="mt-4">
                <input
                  type="hidden"
                  name="workspace"
                  value={project.workspace_id}
                />
                <input type="hidden" name="project" value={project.id} />
                <SubmitButton>Open project</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-7 text-sm text-muted-foreground">
          No projects in this workspace yet. Create your first project to get
          started.
        </p>
      )}
    </div>
  );
}
