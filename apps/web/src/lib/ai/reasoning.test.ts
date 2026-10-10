import { AiValidationError } from '@testpilot/ai';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runAiReasoning } from './reasoning';
import { AiReasoningError } from '@testpilot/ai/server';
const id = '16000000-0000-0000-0000-000000000001';
const scope = {
  projectId: id,
  sourceId: id,
  workflow: 'PLANNING' as const,
  anchorId: id,
};
const key = 'sk-' + 'testonly'.repeat(8);
function client(
  rpc = vi
    .fn()
    .mockResolvedValueOnce({
      data: { id, nonce: id, createdAt: new Date().toISOString() },
      error: null,
    })
    .mockResolvedValue({ data: id, error: null }),
) {
  return { rpc, db: { rpc } as unknown as SupabaseClient };
}
beforeEach(() => {
  vi.stubEnv('OPENAI_AI_ENABLED', 'true');
  vi.stubEnv('OPENAI_API_KEY', key);
  vi.stubEnv('OPENAI_MODEL', 'gpt-4.1-mini');
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(
    Error('No provider network permitted'),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it('disabled or missing key makes no admission or SDK request', async () => {
  const c = client(),
    build = vi.fn();
  vi.stubEnv('OPENAI_AI_ENABLED', 'false');
  await expect(runAiReasoning(c.db, scope, {}, build)).rejects.toMatchObject({
    code: 'DISABLED',
  });
  expect(c.rpc).not.toHaveBeenCalled();
  expect(build).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv('OPENAI_AI_ENABLED', 'true');
  vi.stubEnv('OPENAI_API_KEY', '');
  await expect(runAiReasoning(c.db, scope, {}, build)).rejects.toMatchObject({
    code: 'MISSING_KEY',
  });
  expect(c.rpc).not.toHaveBeenCalled();
});
it.each(['54000', '42501', '23505'])(
  'denied admission %s never reaches provider',
  async (code) => {
    const c = client(
        vi.fn().mockResolvedValue({ data: null, error: { code } }),
      ),
      build = vi.fn();
    await expect(runAiReasoning(c.db, scope, {}, build)).rejects.toBeInstanceOf(
      AiReasoningError,
    );
    expect(build).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it('uncertain admission or oversized context fails closed', async () => {
  const c = client(vi.fn().mockResolvedValue({ data: null, error: null })),
    build = vi.fn();
  await expect(runAiReasoning(c.db, scope, {}, build)).rejects.toMatchObject({
    code: 'ADMISSION',
  });
  await expect(
    runAiReasoning(c.db, scope, { text: 'x'.repeat(9000) }, build),
  ).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(build).not.toHaveBeenCalled();
});
it('provider failures record only safe usage/error metadata and no output', async () => {
  const c = client();
  await expect(
    runAiReasoning(c.db, scope, {}, async () => {
      throw new AiReasoningError('CREDITS');
    }),
  ).rejects.toMatchObject({ code: 'CREDITS' });
  expect(c.rpc.mock.calls[1]).toEqual([
    'complete_ai_reasoning',
    {
      request_input: id,
      nonce_input: id,
      state_input: 'FAILED',
      usage_input: {
        inputTokens: null,
        outputTokens: null,
        responseId: null,
        errorCode: 'CREDITS',
      },
      payload_input: null,
    },
  ]);
  expect(JSON.stringify(c.rpc.mock.calls)).not.toContain(key);
});
it('validation failure and accounting failure cannot persist proposals', async () => {
  const c = client(
    vi
      .fn()
      .mockResolvedValueOnce({
        data: { id, nonce: id, createdAt: new Date().toISOString() },
        error: null,
      })
      .mockResolvedValue({ data: null, error: { code: 'network' } }),
  );
  await expect(
    runAiReasoning(c.db, scope, {}, async () => {
      throw Error('untrusted response ' + key);
    }),
  ).rejects.toMatchObject({ code: 'USAGE_UNCERTAIN' });
  expect(c.rpc.mock.calls[1]![1]).toMatchObject({ payload_input: null });
});
it('successful completion uses one atomic persistence call with safe receipt', async () => {
  const c = client();
  await expect(
    runAiReasoning(c.db, scope, {}, async (provider) => {
      provider.receipt = {
        inputTokens: 100,
        outputTokens: 30,
        responseId: 'resp_fixture',
      };
      return { proposal: 'validated local test fixture' };
    }),
  ).resolves.toBe(id);
  expect(c.rpc.mock.calls[1]![1]).toMatchObject({
    state_input: 'COMPLETED',
    usage_input: {
      inputTokens: 100,
      outputTokens: 30,
      responseId: 'resp_fixture',
      errorCode: null,
    },
  });
  expect(fetch).not.toHaveBeenCalled();
});
it('usage over a reservation rejects proposal and records uncertainty', async () => {
  const c = client();
  await expect(
    runAiReasoning(c.db, scope, {}, async (provider) => {
      provider.receipt = {
        inputTokens: 12001,
        outputTokens: 10,
        responseId: null,
      };
      return {};
    }),
  ).rejects.toMatchObject({ code: 'USAGE_UNCERTAIN' });
  expect(c.rpc.mock.calls[1]![1]).toMatchObject({
    state_input: 'UNCERTAIN',
    payload_input: null,
  });
});
it('result persistence failure never retries provider or creates another admission', async () => {
  const c = client(
      vi
        .fn()
        .mockResolvedValueOnce({
          data: { id, nonce: id, createdAt: new Date().toISOString() },
          error: null,
        })
        .mockResolvedValue({ data: null, error: { code: 'unknown' } }),
    ),
    build = vi.fn().mockResolvedValue({});
  await expect(runAiReasoning(c.db, scope, {}, build)).rejects.toMatchObject({
    code: 'USAGE_UNCERTAIN',
  });
  expect(build).toHaveBeenCalledTimes(1);
  expect(c.rpc).toHaveBeenCalledTimes(2);
});
it('pre-cancelled request does not consume admission', async () => {
  const c = client(),
    controller = new AbortController();
  controller.abort();
  await expect(
    runAiReasoning(c.db, scope, {}, vi.fn(), controller.signal),
  ).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(c.rpc).not.toHaveBeenCalled();
});

it.each(['RATE_LIMIT', 'PROVIDER_TRANSIENT', 'PRE_SEND'] as const)(
  'settles confirmed transient %s without refund or automatic retry',
  async (code) => {
    const c = client();
    const build = vi.fn().mockRejectedValue(new AiReasoningError(code));
    await expect(runAiReasoning(c.db, scope, {}, build)).rejects.toMatchObject({
      code,
    });
    expect(c.rpc).toHaveBeenCalledTimes(2);
    expect(build).toHaveBeenCalledTimes(1);
    expect(c.rpc.mock.calls[1]![1]).toMatchObject({
      state_input: 'FAILED',
      payload_input: null,
      usage_input: { inputTokens: null, outputTokens: null, errorCode: code },
    });
  },
);
it.each(['TIMEOUT', 'NETWORK', 'CANCELLED', 'USAGE_UNCERTAIN'] as const)(
  'records uncertain %s without releasing deduplication',
  async (code) => {
    const c = client();
    await expect(
      runAiReasoning(c.db, scope, {}, async () => {
        throw new AiReasoningError(code);
      }),
    ).rejects.toMatchObject({ code });
    expect(c.rpc.mock.calls[1]![1]).toMatchObject({
      state_input: 'UNCERTAIN',
      payload_input: null,
      usage_input: { inputTokens: null, outputTokens: null, errorCode: code },
    });
    expect(c.rpc).toHaveBeenCalledTimes(2);
  },
);

it('correlates safe grounding diagnostics with admission and preserves failed reconciliation', async () => {
  const c = client(),
    log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(
    runAiReasoning(c.db, scope, {}, async () => {
      throw new AiValidationError(
        'GROUNDING',
        'OPERATION_REFERENCE',
        'OPERATION',
      );
    }),
  ).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(log).toHaveBeenCalledWith('AI_VALIDATION_REJECTED', {
    attemptId: id,
    stage: 'GROUNDING',
    code: 'AI_VALIDATION_REJECTED',
    rule: 'OPERATION_REFERENCE',
    referenceCategory: 'OPERATION',
    rejectionCount: 1,
  });
  expect(c.rpc.mock.calls[1]?.[1]).toMatchObject({
    state_input: 'FAILED',
    payload_input: null,
    usage_input: { errorCode: 'VALIDATION' },
  });
  expect(fetch).not.toHaveBeenCalled();
});
it('unknown validation errors never leak exception messages or raw content', async () => {
  const c = client(),
    log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(
    runAiReasoning(c.db, scope, {}, async () => {
      throw Error('private@example.com secret=' + key);
    }),
  ).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(JSON.stringify(log.mock.calls)).not.toContain('private@example.com');
  expect(JSON.stringify(log.mock.calls)).not.toContain(key);
  expect(log).toHaveBeenCalledWith(
    'AI_VALIDATION_REJECTED',
    expect.objectContaining({
      attemptId: id,
      rule: 'UNCLASSIFIED_BUILD_FAILURE',
    }),
  );
});
