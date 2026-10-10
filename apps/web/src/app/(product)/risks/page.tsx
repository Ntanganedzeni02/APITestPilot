import { RequirementsPage } from '../../../components/qa-intelligence/requirements-page';
export const metadata = { title: 'Risks' };
export default async function Risks({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <RequirementsPage kind="RISK" query={await searchParams} />;
}
