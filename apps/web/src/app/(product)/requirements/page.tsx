import { IntelligencePage } from '../../../components/qa-intelligence/page';
export const metadata = { title: 'Requirements' };
export default async function Requirements({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <IntelligencePage kind="REQUIREMENT" query={await searchParams} />;
}
