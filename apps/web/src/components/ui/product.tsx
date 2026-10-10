import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, CircleDashed } from 'lucide-react';
import { readableStatus } from '../../lib/display';
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="product-header">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
export function Card({
  title,
  children,
  action,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`product-card ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function StatusBadge({ value }: { value: string }) {
  const tone = [
    'APPROVED',
    'CLEAR',
    'SUCCEEDED',
    'CONFIRMED',
    'RECENT',
  ].includes(value)
    ? 'success'
    : ['BLOCKED', 'REJECTED', 'FAILED', 'CRITICAL'].includes(value)
      ? 'danger'
      : [
            'CAUTION',
            'CANDIDATE',
            'PROPOSED',
            'HIGH',
            'WAITING_FOR_APPROVAL',
            'INSUFFICIENT_EVIDENCE',
          ].includes(value)
        ? 'warning'
        : 'neutral';
  return (
    <span className={`status-badge status-${tone}`}>
      {readableStatus(value)}
    </span>
  );
}
export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="product-card">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tracking-tight">{value}</dd>
      {note && (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty-panel">
      <CircleDashed
        className="mb-3 size-6 text-muted-foreground"
        aria-hidden="true"
      />
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {href && action && (
        <Link className="button-link mt-4" href={href}>
          {action}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
export function Progress({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percent =
    Number.isFinite(total) && Number.isFinite(value) && total > 0
      ? Math.min(100, Math.max(0, (value / total) * 100))
      : null;
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-3 text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {percent === null ? 'Not measured' : `${value} of ${total}`}
        </span>
      </div>
      {percent !== null ? (
        <progress
          aria-label={label}
          value={percent}
          max={100}
          className="product-progress"
        />
      ) : (
        <div className="h-1.5 rounded-full bg-muted" aria-hidden="true" />
      )}
    </div>
  );
}
export function Disclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="product-disclosure">
      <summary>{title}</summary>
      <div className="mt-4 min-w-0 space-y-3">{children}</div>
    </details>
  );
}

export function LoadingState({
  label = 'Loading project evidence...',
}: {
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-border bg-muted"
          />
        ))}
      </div>
    </div>
  );
}
