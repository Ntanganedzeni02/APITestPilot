import type { ReactNode } from 'react';
import { Brand } from '../../components/app-shell/brand';
import { ThemeControl } from '../../components/app-shell/theme-control';
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh">
      <header className="flex items-center justify-between px-6 py-7 sm:px-10">
        <Brand />
        <ThemeControl />
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-md px-6 pb-16 pt-10 sm:pt-16"
      >
        <div className="rounded-xl border border-border bg-surface p-7 shadow-sm sm:p-9">
          {children}
        </div>
        <p className="mt-7 text-center text-xs text-muted-foreground">
          Evidence before confidence. Humans retain authority.
        </p>
      </main>
    </div>
  );
}
