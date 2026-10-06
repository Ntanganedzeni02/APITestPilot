'use client';

import Link from 'next/link';
import {
  navigationGroups,
  productRoutes,
  isRouteActive,
  type ProductRoute,
} from '../../lib/navigation';
import { cn } from '../../lib/utils';
import { RouteIcon } from './route-icon';

export function Navigation({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  function item(route: ProductRoute) {
    const active = isRouteActive(pathname, route.href);
    return (
      <Link
        key={route.href}
        href={route.href}
        {...(onNavigate ? { onClick: onNavigate } : {})}
        aria-current={active ? 'page' : undefined}
        className={cn('nav-link', active && 'nav-link-active')}
      >
        <RouteIcon name={route.icon} />
        <span>{route.title}</span>
      </Link>
    );
  }

  return (
    <nav
      aria-label="Main navigation"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3"
    >
      {productRoutes.filter((route) => route.href === '/').map(item)}
      {navigationGroups.map((group) => (
        <section key={group} aria-label={group} className="mt-5">
          <h2 className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {group}
          </h2>
          <div className="space-y-0.5">
            {productRoutes.filter((route) => route.group === group).map(item)}
          </div>
        </section>
      ))}
      <div className="mt-auto pt-5">
        {productRoutes.filter((route) => route.href === '/settings').map(item)}
      </div>
    </nav>
  );
}
