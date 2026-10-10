'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
export function DetailDrawer({
  title,
  description,
  trigger,
  children,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-[min(38rem,100vw)] overflow-y-auto border-l border-border bg-surface p-6 shadow-xl">
          <Dialog.Title className="pr-10 text-xl font-semibold">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {description}
          </Dialog.Description>
          <Dialog.Close
            aria-label="Close details"
            className="absolute right-4 top-4 rounded-lg p-2 hover:bg-muted"
          >
            <X className="size-4" aria-hidden="true" />
          </Dialog.Close>
          <div className="mt-6 min-w-0">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
