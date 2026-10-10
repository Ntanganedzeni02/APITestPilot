import Link from 'next/link';
import { getTenantContext } from '../../../lib/tenancy/context';
import { PageHeader, Card, StatusBadge } from '../../../components/ui/product';
import { ThemeControl } from '../../../components/app-shell/theme-control';
export default async function Settings() {
  const { workspace, project } = await getTenantContext();
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Settings"
        description="Workspace context, appearance and the controls available today."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Workspace">
          <p className="text-lg font-medium">
            {workspace?.name ?? 'No workspace selected'}
          </p>
          {workspace && (
            <div className="mt-3">
              <StatusBadge value={workspace.role} />
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Switch workspace using the sidebar. Membership and authorization
            remain enforced by the existing services.
          </p>
          <Link href="/workspaces/new" className="button-link mt-4">
            Create workspace
          </Link>
        </Card>
        <Card title="Project">
          <p className="text-lg font-medium">
            {project?.name ?? 'No project selected'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="button-link" href="/projects">
              Browse projects
            </Link>
            <Link className="button-link" href="/projects/new">
              Create project
            </Link>
          </div>
        </Card>
        <Card title="Appearance">
          <ThemeControl />
          <p className="mt-3 text-xs text-muted-foreground">
            Choose light, dark or your system preference.
          </p>
        </Card>
        <Card title="Execution and integrations">
          <p className="text-sm text-muted-foreground">
            Execution targets and explicit safety actions are configured in
            Runs. Conversational AI is a preview; there are no provider
            credentials or billing controls on this page.
          </p>
          <Link href="/runs" className="button-link mt-4">
            Open execution controls
          </Link>
        </Card>
      </div>
    </div>
  );
}
