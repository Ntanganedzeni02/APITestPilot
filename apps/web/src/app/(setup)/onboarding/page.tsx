import { redirect } from 'next/navigation';
import { getTenantContext } from '../../../lib/tenancy/context';
import { TenantForm } from '../../../components/tenancy/tenant-form';
export const metadata = { title: 'Set up your workspace' };
export default async function Onboarding() {
  const { workspace } = await getTenantContext();
  if (workspace) redirect('/');
  return (
    <>
      <p className="eyebrow">Step 1 of 2</p>
      <h1 className="page-title">Create your workspace.</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        A workspace holds your projects and their evidence. You’ll be its owner.
        Next, you’ll create your first project.
      </p>
      <TenantForm />
    </>
  );
}
