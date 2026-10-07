import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInvestigationRepository } from '../src/curiosity.js';
import { fixture, proposal, id } from '../../domain/tests/curiosity-fixture.js';
it('derives only trusted source identity', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: id, error: null });
  await createInvestigationRepository({
    rpc,
  } as unknown as SupabaseClient).derive(id);
  expect(rpc).toHaveBeenCalledWith('derive_investigation', {
    run_input: id,
    finding_input: null,
  });
});
it('invalid source rejected before RPC', async () => {
  const rpc = vi.fn();
  await expect(
    createInvestigationRepository({ rpc } as unknown as SupabaseClient).derive(
      'unknown',
    ),
  ).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it.each(['42501', '40001', 'XX000'])(
  'redacts %s database error',
  async (code) => {
    const rpc = vi.fn().mockResolvedValue({
      error: { code, message: 'sensitive fixture detail' },
    });
    await expect(
      createInvestigationRepository({
        rpc,
      } as unknown as SupabaseClient).derive(id),
    ).rejects.not.toThrow('sensitive fixture');
  },
);
it('exact fingerprint and stale revision forwarded unchanged', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: id, error: null });
  await createInvestigationRepository({
    rpc,
  } as unknown as SupabaseClient).decide(id, 7, 'a'.repeat(64), true);
  expect(rpc).toHaveBeenCalledWith('decide_investigation_proposal', {
    proposal_input: id,
    revision_input: 7,
    fingerprint_input: 'a'.repeat(64),
    approve_input: true,
  });
});
it('invalid approval fingerprint never sent', async () => {
  const rpc = vi.fn();
  await expect(
    createInvestigationRepository({ rpc } as unknown as SupabaseClient).decide(
      id,
      0,
      'changed',
      true,
    ),
  ).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it('cross-project context unavailable', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: fixture(), error: null });
  await expect(
    createInvestigationRepository({ rpc } as unknown as SupabaseClient).context(
      id,
      id,
      '14000000-0000-0000-0000-000000000002',
    ),
  ).rejects.toThrow();
});
it('grounding validation before proposal persistence', async () => {
  const rpc = vi.fn();
  const c = fixture();
  c.investigation.expires_at = new Date(Date.now() + 60000).toISOString();
  await expect(
    createInvestigationRepository({ rpc } as unknown as SupabaseClient).propose(
      c,
      { ...proposal(), caseId: 'unknown' },
    ),
  ).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
