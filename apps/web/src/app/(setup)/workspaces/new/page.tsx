import Link from 'next/link';
import { TenantForm } from '../../../../components/tenancy/tenant-form';
export const metadata = { title: 'Create workspace' };
export default function NewWorkspace() {
  return (
    <>
      <p className="eyebrow">Workspace setup</p>
      <h1 className="page-title">Create a workspace.</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Keep a separate collection of projects. You will become its owner.
      </p>
      <TenantForm />
      <Link className="mt-6 inline-block text-sm underline" href="/">
        Back to overview
      </Link>
    </>
  );
}
