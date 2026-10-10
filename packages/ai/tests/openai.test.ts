import { it, expect, vi, afterEach } from 'vitest';
import OpenAI from 'openai';
import {
  OpenAiReasoningProvider,
  readAiConfig,
  AiReasoningError,
  strictOutputSchema,
} from '../src/server.js';
import { planningAiSchema } from '../src/test-planning.js';
const config = { apiKey: 'sk-' + 'testonly'.repeat(6), model: 'gpt-4.1-mini' };
const request = {
  instructions: 'Only supplied data. No tools or execution.',
  data: { requirements: [], risks: [], evidence: [] },
  outputSchema: planningAiSchema,
};
function response(patch: Record<string, unknown> = {}) {
  return {
    id: 'resp_fixture',
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'msg_fixture',
        role: 'assistant',
        status: 'completed',
        content: [
          { type: 'output_text', text: '{"proposals":[]}', annotations: [] },
        ],
      },
    ],
    output_text: '{"proposals":[]}',
    usage: { input_tokens: 100, output_tokens: 30 },
    ...patch,
  };
}
function fixture(
  action: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(response()),
) {
  const provider = new OpenAiReasoningProvider(config, {
    responses: { create: action },
  } as unknown as Pick<OpenAI, 'responses'>);
  return { provider, action };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it.each([undefined, 'false', 'FALSE', '1', ''])(
  'disabled flag %s forbids provider setup',
  (enabled) => {
    expect(() =>
      readAiConfig({
        OPENAI_AI_ENABLED: enabled,
        OPENAI_API_KEY: config.apiKey,
      }),
    ).toThrow('disabled');
  },
);
it('missing and malformed credentials fail without network', () => {
  expect(() => readAiConfig({ OPENAI_AI_ENABLED: 'true' })).toThrow(
    'not configured',
  );
  expect(() =>
    readAiConfig({ OPENAI_AI_ENABLED: 'true', OPENAI_API_KEY: 'invalid' }),
  ).toThrow('authentication');
  expect(() =>
    readAiConfig({
      OPENAI_AI_ENABLED: 'true',
      OPENAI_API_KEY: config.apiKey,
      OPENAI_MODEL: 'unpriced-model',
    }),
  ).toThrow('configuration');
});
it('uses Responses, strict schema, no tools, no storage and bounded output', async () => {
  const { provider, action } = fixture();
  await expect(
    provider.plan(request, new AbortController().signal),
  ).resolves.toEqual({ proposals: [] });
  const payload = action.mock.calls[0]![0];
  expect(payload).toMatchObject({
    model: 'gpt-4.1-mini',
    store: false,
    tools: [],
    max_output_tokens: 4000,
    truncation: 'disabled',
    text: { format: { strict: true, type: 'json_schema' } },
  });
  expect(JSON.stringify(payload)).not.toContain(config.apiKey);
  expect(provider.receipt).toEqual({
    inputTokens: 100,
    outputTokens: 30,
    responseId: 'resp_fixture',
  });
});
it('uses the official SDK with a pinned endpoint and no redirect/retries (mocked transport)', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(response()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const provider = new OpenAiReasoningProvider(config);
  await provider.plan(request, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const call = fetcher.mock.calls[0]!;
  expect(call[0] instanceof Request ? call[0].url : String(call[0])).toBe(
    'https://api.openai.com/v1/responses',
  );
  expect(
    call[0] instanceof Request ? call[0].redirect : call[1]?.redirect,
  ).toBe('error');
});
it.each([
  [400, 'PROVIDER'],
  [401, 'INVALID_KEY'],
  [403, 'INVALID_KEY'],
  [429, 'RATE_LIMIT'],
  [500, 'PROVIDER_TRANSIENT'],
  [503, 'PROVIDER_TRANSIENT'],
] as const)(
  'safe provider %s errors retain no raw provider text',
  async (status, code) => {
    const error = new OpenAI.APIError(
      status,
      { message: 'secret response ' + config.apiKey },
      'raw payload',
      new Headers(),
    );
    const { provider } = fixture(vi.fn().mockRejectedValue(error));
    try {
      await provider.plan(request, new AbortController().signal);
      throw Error('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(AiReasoningError);
      expect((e as AiReasoningError).code).toBe(code);
      expect(String(e)).not.toContain(config.apiKey);
    }
  },
);
it('insufficient credits is distinct from ordinary rate limit', async () => {
  const error = new OpenAI.APIError(
    429,
    { code: 'insufficient_quota' },
    'secret',
    new Headers(),
  );
  const { provider } = fixture(vi.fn().mockRejectedValue(error));
  await expect(
    provider.plan(request, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'CREDITS' });
});
it('network failures are safe', async () => {
  const { provider } = fixture(vi.fn().mockRejectedValue(Error(config.apiKey)));
  await expect(
    provider.plan(request, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'NETWORK' });
});
it.each([
  { output_text: 'not json' },
  { output_text: '{"proposals":"invalid"}' },
  { output_text: '{"proposals":[],"execute":true}' },
  { status: 'incomplete' },
  {
    output: [
      { type: 'message', content: [{ type: 'refusal', refusal: 'no' }] },
    ],
  },
])('rejects malformed, truncated and refusal outputs', async (patch) => {
  const { provider } = fixture(vi.fn().mockResolvedValue(response(patch)));
  await expect(
    provider.plan(request, new AbortController().signal),
  ).rejects.toBeInstanceOf(AiReasoningError);
});
it('cancelled input never calls the SDK', async () => {
  const { provider, action } = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(provider.plan(request, controller.signal)).rejects.toMatchObject(
    { code: 'CANCELLED' },
  );
  expect(action).not.toHaveBeenCalled();
});
it('cancellation and deadline abort in-flight requests', async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  const action = vi.fn(
    (_payload, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(Error('abort'))),
      ),
  );
  const { provider } = fixture(action);
  const pending = expect(
    provider.plan(request, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'TIMEOUT' });
  deadline.abort();
  await pending;
  expect(AbortSignal.timeout).toHaveBeenCalledWith(25000);
});
it('oversized context or a credential echoed into data never reaches SDK', async () => {
  const { provider, action } = fixture();
  await expect(
    provider.plan(
      { ...request, instructions: 'x'.repeat(13000) },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(
    provider.plan(
      { ...request, instructions: config.apiKey },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(action).not.toHaveBeenCalled();
});
it('strict schema retains enums and closed objects but leaves UUID/uniqueness to domain', () => {
  expect(strictOutputSchema({ enum: ['LOW', 'HIGH'] })).toEqual({
    enum: ['LOW', 'HIGH'],
    type: 'string',
  });
  expect(
    strictOutputSchema({ type: 'string', const: 'fixed', format: 'uuid' }),
  ).toEqual({ type: 'string', enum: ['fixed'] });
});

it.each(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'])(
  'classifies definite pre-send %s without assuming usage refunds',
  async (code) => {
    const cause = Object.assign(new Error('private host'), { code });
    const error = new OpenAI.APIConnectionError({
      cause: new Error('fetch failed', { cause }),
    });
    const { provider } = fixture(vi.fn().mockRejectedValue(error));
    await expect(
      provider.plan(request, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'PRE_SEND' });
  },
);
it.each(['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_SOCKET', 'UNKNOWN'])(
  'keeps uncertain connection %s blocked',
  async (code) => {
    const error = new OpenAI.APIConnectionError({
      cause: Object.assign(new Error('private failure'), { code }),
    });
    const { provider } = fixture(vi.fn().mockRejectedValue(error));
    await expect(
      provider.plan(request, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'NETWORK' });
  },
);

it('mixed aggregate connection failures remain uncertain even with a refused summary code', async () => {
  const cause = Object.assign(
    new AggregateError([
      Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
      Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
    ]),
    { code: 'ECONNREFUSED' },
  );
  const { provider } = fixture(
    vi.fn().mockRejectedValue(new OpenAI.APIConnectionError({ cause })),
  );
  await expect(
    provider.plan(request, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'NETWORK' });
});

it.each([
  ['{broken', 'PARSE', 'OUTPUT_INVALID_JSON'],
  ['{"proposals":"wrong"}', 'SCHEMA', 'OUTPUT_SCHEMA_MISMATCH'],
  ['', 'PARSE', 'OUTPUT_MISSING_OR_OVERSIZED'],
])(
  'reports safe diagnostics for %s without losing usage',
  async (text, stage, rule) => {
    const { provider, action } = fixture(
      vi.fn().mockResolvedValue(response({ output_text: text })),
    );
    await expect(
      provider.plan(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      diagnostic: {
        stage,
        rule,
        code: 'AI_VALIDATION_REJECTED',
        rejectionCount: 1,
      },
    });
    expect(provider.receipt).toMatchObject({
      inputTokens: 100,
      outputTokens: 30,
      responseId: 'resp_fixture',
    });
    expect(action).toHaveBeenCalledTimes(1);
  },
);
