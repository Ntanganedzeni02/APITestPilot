import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTenantService } from '../src/index.js';
const id = '10000000-0000-0000-0000-000000000001';
function fixture(user: unknown, membership: unknown) {
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
  const rpc = vi.fn().mockResolvedValue({ data: id, error: null });
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: membership, error: null }),
  };
  const from = vi.fn().mockReturnValue(query);
  const client = { auth: { getUser }, rpc, from } as unknown as SupabaseClient;
  return { service: createTenantService(client), rpc, getUser, from };
}
describe('server persistence authorization (provider fixtures, not RLS evidence)', () => {
  it('rejects unauthenticated callers before creation', async () => {
    const test = fixture(null, { role: 'OWNER' });
    await expect(
      test.service.createWorkspace('Valid workspace'),
    ).rejects.toMatchObject({ kind: 'AUTHENTICATION' });
    await expect(
      test.service.createProject(id, 'Valid project'),
    ).rejects.toMatchObject({ kind: 'AUTHENTICATION' });
    expect(test.rpc).not.toHaveBeenCalled();
  });
  it('rejects nonmembers and invalid roles before RPC invocation', async () => {
    for (const membership of [null, { role: 'ROOT' }]) {
      const test = fixture({ id }, membership);
      await expect(
        test.service.createProject(id, 'Valid project'),
      ).rejects.toThrow();
      expect(test.rpc).not.toHaveBeenCalled();
    }
  });
  it('derives the user from authenticated state and never accepts actor input', async () => {
    const test = fixture({ id }, { role: 'MEMBER' });
    expect(await test.service.createProject(id, '  Valid project  ')).toBe(id);
    expect(test.getUser).toHaveBeenCalled();
    expect(test.rpc).toHaveBeenCalledWith('create_project', {
      target_workspace: id,
      project_name: 'Valid project',
    });
  });
  it('rejects malformed tenant IDs before persistence queries', async () => {
    const test = fixture({ id }, { role: 'OWNER' });
    await expect(
      test.service.createProject('forged', 'Valid project'),
    ).rejects.toThrow('Invalid resource identifier');
    expect(test.from).not.toHaveBeenCalled();
    expect(test.rpc).not.toHaveBeenCalled();
  });
});
