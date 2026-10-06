import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-border bg-surface px-6 py-12 text-center"
    >
      <div className="mb-6 flex size-14 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
        {icon}
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {children}
    </section>
  );
}
