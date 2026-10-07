import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFindingRepository, decodeFinding } from '../src/findings.js';
const id = '14000000-0000-0000-0000-000000000001';
it('derivation sends only persisted run identity, never evidence from caller', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: id, error: null });
  expect(
    await createFindingRepository({ rpc } as unknown as SupabaseClient).derive(
      id,
    ),
  ).toBe(id);
  expect(rpc).toHaveBeenCalledWith('derive_execution_evidence', {
    run_input: id,
  });
});
it('invalid run ID is rejected before any RPC', () => {
  const rpc = vi.fn();
  expect(() =>
    createFindingRepository({ rpc } as unknown as SupabaseClient).derive(
      'invented',
    ),
  ).toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it('review requires closed inputs before calling RPC', () => {
  const rpc = vi.fn();
  expect(() =>
    createFindingRepository({ rpc } as unknown as SupabaseClient).review(
      id,
      -1,
      'CONFIRM',
      'HIGH',
      '',
    ),
  ).toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it.each([
  ['40001', 'CONFLICT'],
  ['42501', 'ACCESS'],
  ['XX000', 'DATABASE'],
])('maps %s without leaking raw SQL data', async (code, kind) => {
  const rpc = vi.fn().mockResolvedValue({
    data: null,
    error: { code, message: 'private database fixture detail' },
  });
  await expect(
    createFindingRepository({ rpc } as unknown as SupabaseClient).derive(id),
  ).rejects.toMatchObject({ kind });
  await expect(
    createFindingRepository({ rpc } as unknown as SupabaseClient).derive(id),
  ).rejects.not.toThrow('private database');
});
it('rejects malformed persisted classifications instead of displaying them', () => {
  expect(() =>
    decodeFinding({
      id,
      workspace_id: id,
      project_id: id,
      status: 'AUTO_CONFIRMED',
    }),
  ).toThrow();
});
