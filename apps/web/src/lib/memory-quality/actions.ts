'use server';
import { revalidatePath } from 'next/cache';
import { validateId } from '@testpilot/domain';
import { intelligenceContext } from './context';
export interface IntelligenceActionState {
  error?: string;
  message?: string;
}
export async function intelligenceAction(
  _previous: IntelligenceActionState,
  form: FormData,
): Promise<IntelligenceActionState> {
  try {
    const context = await intelligenceContext(
      validateId(form.get('environmentId')),
    );
    if (!context) return { error: 'Select a project first.' };
    const mode = form.get('mode');
    let message: string;
    if (mode === 'MEMORY') {
      const count = await context.repo.refresh(
        context.project.id,
        context.environment.id,
      );
      message = count
        ? `${count} new supporting observations derived.`
        : 'Memory is current. No duplicate observations added.';
    } else if (mode === 'QUALITY') {
      const before = await context.repo.current(
        context.workspace.id,
        context.project.id,
        context.environment.id,
      );
      const id = await context.repo.assess(
        context.project.id,
        context.environment.id,
      );
      message =
        id === before.current?.id
          ? 'Assessment remains current; relevant evidence has not changed.'
          : 'Assessment updated from persisted evidence.';
    } else return { error: 'Invalid action.' };
    revalidatePath('/memory');
    revalidatePath('/quality');
    revalidatePath('/');
    return { message };
  } catch {
    return {
      error:
        'Unable to refresh intelligence. Check project access, source evidence and history capacity.',
    };
  }
}
