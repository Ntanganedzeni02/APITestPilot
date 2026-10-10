import { redirect } from 'next/navigation';
import { getTenantContext } from '../../../../lib/tenancy/context';
import { TenantForm } from '../../../../components/tenancy/tenant-form';
export const metadata = { title: 'Create project' };
export default async function NewProject() {
  const { workspace } = await getTenantContext();
  if (!workspace) redirect('/onboarding');
  return (
    <div>
      <p className="eyebrow">{workspace.name}</p>
      <h1 className="page-title">Create a project.</h1>
      <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
        Give your API a home. Development, staging and production environments
        will be created together with your project.
      </p>
      <TenantForm workspace={workspace.id} />
    </div>
  );
}
