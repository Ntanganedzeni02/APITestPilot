import type { ReactNode } from 'react';
import { requireUser } from '../../lib/auth/server';
import { Brand } from '../../components/app-shell/brand';
import { ThemeControl } from '../../components/app-shell/theme-control';
import { SubmitButton } from '../../components/tenancy/submit-button';
import { signOutAction } from '../../lib/auth/actions';
export const dynamic = 'force-dynamic';
export default async function SetupLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();
  return (
    <div className="min-h-svh">
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-7">
        <Brand />
        <div className="flex items-center gap-4">
          <ThemeControl />
          <form action={signOutAction}>
            <SubmitButton>Sign out</SubmitButton>
          </form>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-xl px-6 pb-16 pt-12">
        {children}
      </main>
    </div>
  );
}
