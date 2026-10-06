import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductPage } from '../../components/empty-state/product-page';
import { findProductRoute, productRoutes } from '../../lib/navigation';

export function generateStaticParams() {
  return productRoutes
    .filter((route) => route.href !== '/')
    .map((route) => ({ area: route.href.slice(1) }));
}

type PageProps = { params: Promise<{ area: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { area } = await params;
  const route = findProductRoute(`/${area}`);
  return { title: route?.title ?? 'Page not found' };
}

export default async function AreaPage({ params }: PageProps) {
  const { area } = await params;
  const route = findProductRoute(`/${area}`);
  if (!route || route.href === '/') notFound();
  return <ProductPage route={route} />;
}
