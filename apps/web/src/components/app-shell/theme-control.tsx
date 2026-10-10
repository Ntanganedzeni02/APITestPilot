'use client';

import { SunMoon } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeControl() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface pl-2.5">
      <SunMoon className="size-4 text-muted-foreground" aria-hidden="true" />
      <label htmlFor="theme" className="sr-only">
        Color theme
      </label>
      <select
        id="theme"
        value={theme ?? 'system'}
        onChange={(event) => setTheme(event.target.value)}
        className="h-8 max-w-24 cursor-pointer rounded-md bg-transparent pr-2 text-xs text-foreground"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
}
