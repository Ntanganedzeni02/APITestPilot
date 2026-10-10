'use client';
import { useFormStatus } from 'react-dom';
import { Button } from '../ui/button';
export function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button size="sm" variant="outline" disabled={pending}>
      {pending ? 'Please wait…' : children}
    </Button>
  );
}
