import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell/app-shell';
import { ThemeProvider } from '../components/app-shell/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Overview · TestPilot', template: '%s · TestPilot' },
  description: 'Autonomous, evidence-driven API quality assurance.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
