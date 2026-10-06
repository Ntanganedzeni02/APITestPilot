import type { ProductRoute } from '../../lib/navigation';
import { RouteIcon } from '../navigation/route-icon';
import { EmptyState } from './empty-state';

export function ProductPage({ route }: { route: ProductRoute }) {
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">{route.group ?? 'Application'}</p>
        <h1 className="page-title">{route.title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {route.description}
        </p>
      </div>
      <EmptyState
        icon={<RouteIcon name={route.icon} className="size-6" />}
        title={route.emptyTitle}
        description={route.emptyDescription}
      >
        <span className="mt-6 rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">
          This area is awaiting project setup
        </span>
      </EmptyState>
    </div>
  );
}
