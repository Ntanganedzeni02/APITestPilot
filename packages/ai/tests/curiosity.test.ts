import { expect, it, vi } from 'vitest';
import {
  curiosityProviderInput,
  reasonAboutInvestigation,
} from '../src/curiosity.js';
import { fixture, proposal } from '../../domain/tests/curiosity-fixture.js';
it('provider context excludes raw bodies, secrets and imported prose', () => {
  const input = curiosityProviderInput(fixture());
  expect(JSON.stringify(input)).not.toContain('/fixture');
  expect(input.context).not.toHaveProperty('body');
  expect(input.outputSchema.additionalProperties).toBe(false);
});
it('provider output has zero execution authority', async () => {
  const context = fixture();
  context.investigation.expires_at = new Date(Date.now() + 60000).toISOString();
  const provider = {
    providerId: 'TEST_FIXTURE_ONLY',
    propose: vi.fn().mockResolvedValue(proposal()),
  };
  expect(
    await reasonAboutInvestigation(
      provider,
      context,
      new AbortController().signal,
    ),
  ).toEqual(proposal());
  expect(provider.propose).toHaveBeenCalledOnce();
});
it.each(['url', 'authorization', 'operationId', 'chainOfThought', 'budget'])(
  'rejects provider %s',
  async (field) => {
    const provider = {
      providerId: 'TEST_FIXTURE_ONLY',
      propose: vi.fn().mockResolvedValue({ ...proposal(), [field]: 'fixture' }),
    };
    await expect(
      reasonAboutInvestigation(
        provider,
        fixture(),
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  },
);
it('abort makes no provider call', async () => {
  const c = new AbortController();
  c.abort();
  const provider = { providerId: 'TEST_FIXTURE_ONLY', propose: vi.fn() };
  await expect(
    reasonAboutInvestigation(provider, fixture(), c.signal),
  ).rejects.toThrow();
  expect(provider.propose).not.toHaveBeenCalled();
});
