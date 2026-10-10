import { RequirementsPage } from '../../../components/qa-intelligence/requirements-page';
export const metadata = { title: 'Requirements' };
export default async function Requirements({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <RequirementsPage query={await searchParams} />;
}
