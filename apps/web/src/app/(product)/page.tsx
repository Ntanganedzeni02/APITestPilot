import { Overview } from '../../components/empty-state/overview';
import { getTenantContext } from '../../lib/tenancy/context';
export default async function Home() {
  const { project, workspace, service } = await getTenantContext();
  const environments =
    project && workspace
      ? await service.getProjectEnvironments(workspace.id, project.id)
      : [];
  return (
    <>
      <Overview projectName={project?.name} createHref="/projects/new" />
      {project && (
        <section className="mt-8 rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Project environments</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Logical environments only. No API URLs or credentials are stored.
          </p>
          <ul className="mt-4 flex flex-wrap gap-3">
            {environments.map((entry) => (
              <li
                key={entry.id}
                className="rounded-md border border-border px-3 py-2 text-xs"
              >
                {entry.type}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
