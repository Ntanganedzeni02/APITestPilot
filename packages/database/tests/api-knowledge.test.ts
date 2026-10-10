import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createApiKnowledgeRepository } from '../src/index.js';
const ws = '10000000-0000-0000-0000-000000000001';
const project = '20000000-0000-0000-0000-000000000001';
function fixture(membership: unknown, projects: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: membership, error: null }),
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve({ data: projects, error: null }).then(resolve);
    },
  };
  const rpc = vi.fn();
  const client = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: ws } }, error: null }),
    },
    from: vi.fn().mockReturnValue(chain),
    rpc,
  } as unknown as SupabaseClient;
  return { repository: createApiKnowledgeRepository(client), rpc };
}
describe('API persistence authorization (provider fixtures)', () => {
  it('blocks nonmembers independently of selected project', async () => {
    const f = fixture(null, []);
    await expect(f.repository.list(ws, project)).rejects.toMatchObject({
      kind: 'ACCESS',
    });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it('blocks a project from another workspace even for a valid member', async () => {
    const f = fixture({ role: 'OWNER' }, []);
    await expect(f.repository.list(ws, project)).rejects.toMatchObject({
      kind: 'ACCESS',
    });
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
