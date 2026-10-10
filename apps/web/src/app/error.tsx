'use client';

import { Button } from '../components/ui/button';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="product-card my-8">
      <p className="eyebrow">Unable to load this view</p>
      <h1 className="page-title">Something interrupted the page.</h1>
      <p className="mb-6 mt-4 text-sm text-muted-foreground">
        Try loading it again. If you submitted an action, inspect its recorded
        status before retrying.
      </p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
