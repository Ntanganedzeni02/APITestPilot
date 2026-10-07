import { IntelligencePage } from '../../../components/qa-intelligence/page';
export const metadata = { title: 'Risks' };
export default async function Risks({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <IntelligencePage kind="RISK" query={await searchParams} />;
}
