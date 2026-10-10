import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createExecutionRepository,
  ExecutionPersistenceError,
} from '../src/execution';
const id = '11111111-1111-4111-8111-111111111111';
it.each([
  ['42501', 'ACCESS'],
  ['23514', 'ELIGIBILITY'],
  ['23505', 'CONFLICT'],
  ['40001', 'CONFLICT'],
  ['PGRST202', 'SCHEMA'],
  ['42883', 'SCHEMA'],
  ['XX000', 'DATABASE'],
])(
  'classifies SQLSTATE %s without exposing raw messages',
  async (code, reason) => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code,
          message: 'private provider detail',
          details: 'private',
        },
      }),
    } as unknown as SupabaseClient;
    await expect(
      createExecutionRepository(client).request(id, id),
    ).rejects.toMatchObject({ reason });
    await expect(
      createExecutionRepository(client).request(id, id),
    ).rejects.toBeInstanceOf(ExecutionPersistenceError);
    await expect(
      createExecutionRepository(client).request(id, id),
    ).rejects.not.toThrow('private');
  },
);
it('distinguishes target rejection from planning eligibility', async () => {
  const client = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '23514' } }),
  } as unknown as SupabaseClient;
  await expect(
    createExecutionRepository(client).configure(
      id,
      'https://example.test',
      443,
      true,
    ),
  ).rejects.toMatchObject({ reason: 'CONFIGURATION' });
});
it('identifies missing enabled target in request admission', async () => {
  const client = {
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '23514',
        message: 'Configure an enabled target first',
      },
    }),
  } as unknown as SupabaseClient;
  await expect(
    createExecutionRepository(client).request(id, id),
  ).rejects.toMatchObject({ reason: 'CONFIGURATION' });
});
