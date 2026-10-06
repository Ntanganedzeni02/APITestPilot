import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '../../components/app-shell/app-shell';
import { ContextControls } from '../../components/tenancy/context-controls';
import { SubmitButton } from '../../components/tenancy/submit-button';
import { getTenantContext } from '../../lib/tenancy/context';
import { signOutAction } from '../../lib/auth/actions';
export const dynamic = 'force-dynamic';
export default async function ProductLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await getTenantContext();
  if (!context.workspace) redirect('/onboarding');
  return (
    <AppShell
      sidebarControls={
        <ContextControls
          workspaces={context.workspaces}
          workspace={context.workspace}
          projects={context.projects}
          project={context.project}
        />
      }
      contextControls={
        <span className="hidden max-w-64 truncate text-xs text-muted-foreground md:inline">
          {context.project?.name ?? context.workspace.name}
        </span>
      }
      accountControls={
        <form action={signOutAction}>
          <SubmitButton>Sign out</SubmitButton>
        </form>
      }
    >
      {children}
    </AppShell>
  );
}
