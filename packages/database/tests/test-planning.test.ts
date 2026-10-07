import { it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestPlanRepository } from '../src/test-planning.js';
const id = '16000000-0000-0000-0000-000000000001';
it('planning review maps exact expected revision with no tenant or actor input', async () => {
  const rpc = vi.fn(async () => ({ data: id, error: null }));
  const repo = createTestPlanRepository({ rpc } as unknown as SupabaseClient);
  await repo.review(id, null, 'EDIT', 'why', 'title', 'objective', 'expected');
  expect(rpc).toHaveBeenCalledWith('review_test_item', {
    target_item: id,
    expected_review: null,
    decision_input: 'EDIT',
    rationale_input: 'why',
    title_input: 'title',
    objective_input: 'objective',
    expected_input: 'expected',
  });
});
it.each([
  ['42501', 'ACCESS'],
  ['40001', 'CONFLICT'],
  ['23514', 'DATABASE'],
])('maps database error %s safely', async (code, kind) => {
  const rpc = vi.fn(async () => ({ data: null, error: { code } }));
  await expect(
    createTestPlanRepository({ rpc } as unknown as SupabaseClient).review(
      id,
      null,
      'APPROVE',
      '',
      null,
      null,
      null,
    ),
  ).rejects.toMatchObject({ kind });
});
it('rejects invalid UUID before calling database', async () => {
  const rpc = vi.fn();
  await expect(
    createTestPlanRepository({ rpc } as unknown as SupabaseClient).review(
      'forged',
      null,
      'APPROVE',
      '',
      null,
      null,
      null,
    ),
  ).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it('list does not hide a persistence failure as empty state', async () => {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: async () => ({ data: null, error: { code: 'DATABASE' } }),
  };
  await expect(
    createTestPlanRepository({
      from: () => query,
    } as unknown as SupabaseClient).list(id, id),
  ).rejects.toThrow();
});
