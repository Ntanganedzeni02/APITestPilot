'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Menu, ShieldCheck, MessagesSquare } from 'lucide-react';
import { findProductRoute } from '../../lib/navigation';
import { Navigation } from '../navigation/navigation';
import { Button } from '../ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet';
import { Brand } from './brand';
import { ThemeControl } from './theme-control';

interface AppShellProps {
  children: ReactNode;
  sidebarControls?: ReactNode;
  contextControls?: ReactNode;
  accountControls?: ReactNode;
}

export function AppShell({
  children,
  sidebarControls,
  contextControls,
  accountControls,
}: AppShellProps) {
  const pathname = usePathname();
  const route = findProductRoute(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-svh">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside
        aria-label="Desktop sidebar"
        className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-sidebar lg:flex"
      >
        <div className="px-5 pb-5 pt-6">
          <Brand />
        </div>
        <div className="px-4 pb-4">
          {sidebarControls ?? (
            <p className="text-xs text-muted-foreground">No project selected</p>
          )}
        </div>
        <Navigation pathname={pathname} />
        <div className="flex items-center gap-2 border-t border-border px-6 py-4 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Evidence before confidence
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-5 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <div className="lg:hidden">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open navigation"
                  >
                    <Menu aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetTitle className="sr-only">
                    TestPilot navigation
                  </SheetTitle>
                  <SheetDescription className="sr-only">
                    Navigate project, testing, release and intelligence areas.
                  </SheetDescription>
                  <div className="mb-7 pr-10">
                    <Brand />
                  </div>
                  <div className="mb-5 px-3">
                    {sidebarControls ?? 'No project selected'}
                  </div>
                  <Navigation
                    pathname={pathname}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </SheetContent>
              </Sheet>
            </div>
            <div
              aria-label="Current location"
              className="flex items-center gap-2 text-xs"
            >
              <span className="hidden text-muted-foreground sm:inline">
                TestPilot
              </span>
              <ChevronRight
                className="hidden size-3 text-muted-foreground sm:inline"
                aria-hidden="true"
              />
              <span className="truncate font-medium">
                {route?.title ??
                  (pathname.startsWith('/quality')
                    ? 'Quality intelligence'
                    : pathname.startsWith('/projects')
                      ? 'Projects'
                      : 'Page not found')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {contextControls ?? (
              <span className="hidden text-xs text-muted-foreground md:inline">
                No project selected
              </span>
            )}
            <Link href="/ask" className="button-link hidden sm:inline-flex">
              <MessagesSquare className="size-4" aria-hidden="true" />
              Ask TestPilot
              <span className="text-[10px] text-muted-foreground">Preview</span>
            </Link>
            <ThemeControl />
            {accountControls}
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1440px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
        >
          <div className="product-content">{children}</div>
        </main>
        <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 pb-7 text-[11px] text-muted-foreground sm:px-8 lg:px-10">
          <span>Grounded intelligence. Deliberate execution.</span>
          <span>Humans retain release authority.</span>
        </footer>
      </div>
    </div>
  );
}
