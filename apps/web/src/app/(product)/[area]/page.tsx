import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductPage } from '../../../components/empty-state/product-page';
import { findProductRoute } from '../../../lib/navigation';
import { getTenantContext } from '../../../lib/tenancy/context';
type PageProps = { params: Promise<{ area: string }> };
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { area } = await params;
  return { title: findProductRoute(`/${area}`)?.title ?? 'Page not found' };
}
export default async function AreaPage({ params }: PageProps) {
  const { area } = await params;
  const route = findProductRoute(`/${area}`);
  if (!route || route.href === '/') notFound();
  const { project } = await getTenantContext();
  return <ProductPage route={route} hasProject={!!project} />;
}
