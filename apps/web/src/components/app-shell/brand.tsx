import Link from 'next/link';
import { ScanLine } from 'lucide-react';

export function Brand() {
  return (
    <Link
      href="/"
      aria-label="TestPilot overview"
      className="flex w-fit items-center gap-2.5 rounded-md"
    >
      <span className="flex size-7 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
        <ScanLine className="size-4" aria-hidden="true" strokeWidth={2} />
      </span>
      <span className="text-[17px] font-semibold tracking-tight">
        TestPilot
      </span>
    </Link>
  );
}
