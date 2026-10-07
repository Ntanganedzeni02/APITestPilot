import Link from 'next/link';
import { createFindingRepository } from '@testpilot/database';
import { requireUser } from '../../../../lib/auth/server';
import { getTenantContext } from '../../../../lib/tenancy/context';
import { FindingDetailView } from '../../../../components/findings/findings-view';
export default async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ findingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await requireUser();
  const { workspace, project } = await getTenantContext();
  if (!workspace || !project) return <p>Select a project first.</p>;
  try {
    const { findingId } = await params,
      page = Number((await searchParams)['page'] ?? 0);
    const detail = await createFindingRepository(client).detail(
      workspace.id,
      project.id,
      findingId,
      page,
    );
    return (
      <>
        <FindingDetailView detail={detail} />
        {page > 0 && (
          <Link href={'/findings/' + findingId + '?page=' + (page - 1)}>
            Previous occurrences
          </Link>
        )}
        {detail.occurrences.length === 20 && (
          <Link href={'/findings/' + findingId + '?page=' + (page + 1)}>
            More occurrences
          </Link>
        )}
      </>
    );
  } catch {
    return (
      <p role="alert">Finding unavailable. Check permissions or reload.</p>
    );
  }
}
