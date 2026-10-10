import 'server-only';
import { createReleaseRepository } from '@testpilot/database';
import { intelligenceContext } from '../memory-quality/context';
import { requireUser } from '../auth/server';
export async function releaseContext(environment?: string) {
  const c = await intelligenceContext(environment);
  if (!c) return null;
  const { client } = await requireUser();
  return { ...c, repo: createReleaseRepository(client) };
}
