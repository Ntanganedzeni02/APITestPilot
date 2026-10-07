import { createInvestigationRepository } from '@testpilot/database';
import { requireUser } from '../../../../lib/auth/server';
import { getTenantContext } from '../../../../lib/tenancy/context';
import { InvestigationDetail } from '../../../../components/investigations/investigations-view';
export default async function Detail({
  params,
}: {
  params: Promise<{ investigationId: string }>;
}) {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project) return <p>Select a project first.</p>;
  try {
    const { investigationId } = await params;
    const context = await createInvestigationRepository(client).context(
      investigationId,
      workspace.id,
      project.id,
    );
    return (
      <InvestigationDetail
        context={context}
        canApprove={workspace.role === 'OWNER' || workspace.role === 'ADMIN'}
      />
    );
  } catch {
    return (
      <p role="alert">
        Investigation unavailable. Check permissions or reload.
      </p>
    );
  }
}
