import Link from 'next/link';
import { Button } from '../components/ui/button';
import { clearContextAction } from '../lib/tenancy/actions';

export default function NotFound() {
  return (
    <section className="product-card my-8">
      <p className="eyebrow">Page not found</p>
      <h1 className="page-title">This page is not here.</h1>
      <p className="mb-6 mt-4 text-sm text-muted-foreground">
        Use the navigation to explore TestPilot's available areas.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Return to Overview</Link>
      </Button>
      <form action={clearContextAction} className="mt-4">
        <Button variant="ghost">Reset workspace selection</Button>
      </form>
    </section>
  );
}
