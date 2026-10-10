import { AiValidationError, type ValidationDiagnostic } from './diagnostics.js';
// Server-only entrypoint: never re-export provider SDKs from the neutral barrel.
import 'server-only';
import OpenAI from 'openai';
import type {
  TestPlanningProvider,
  PlanningAiRequest,
} from './test-planning.js';
import type { CuriosityProvider, curiosityProviderInput } from './curiosity.js';
export const aiModels = ['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14'] as const;
export const aiLimits = {
  inputTokens: 12000,
  outputTokens: 4000,
  timeoutMs: 25000,
  reservedMicroUsd: 11200,
} as const;
export type AiFailure =
  | 'DISABLED'
  | 'MISSING_KEY'
  | 'INVALID_KEY'
  | 'CONFIGURATION'
  | 'CREDITS'
  | 'RATE_LIMIT'
  | 'PROVIDER_TRANSIENT'
  | 'PRE_SEND'
  | 'PROVIDER'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'REFUSAL'
  | 'TRUNCATED'
  | 'VALIDATION'
  | 'ADMISSION'
  | 'DUPLICATE'
  | 'USAGE_UNCERTAIN';
const messages: Record<AiFailure, string> = {
  DISABLED:
    'AI generation is disabled. Deterministic planning remains available.',
  MISSING_KEY: 'AI provider credentials are not configured.',
  INVALID_KEY: 'AI provider authentication failed.',
  CONFIGURATION: 'AI model configuration is unavailable.',
  CREDITS: 'AI provider credits are unavailable.',
  RATE_LIMIT: 'AI provider rate limit reached. Try later.',
  PROVIDER_TRANSIENT:
    'AI provider is temporarily unavailable. Try again after the admission cooldown.',
  PRE_SEND:
    'AI provider connection could not be established. Try again after the admission cooldown.',
  PROVIDER: 'AI provider request failed; no automatic retry was made.',
  NETWORK: 'AI provider connection failed.',
  TIMEOUT: 'AI reasoning timed out; no proposal was accepted.',
  CANCELLED: 'AI reasoning was cancelled; no proposal was accepted.',
  REFUSAL: 'The AI provider declined this request.',
  TRUNCATED: 'AI output was incomplete; no proposal was accepted.',
  VALIDATION:
    'AI suggestions failed grounding or validation; no proposal was accepted.',
  ADMISSION:
    'AI usage limit reached or accounting unavailable. No AI request was admitted.',
  DUPLICATE:
    'This AI request is already recorded. Reload the project to view its status.',
  USAGE_UNCERTAIN:
    'AI accounting or persistence is uncertain. No additional AI request was made.',
};
export class AiReasoningError extends Error {
  constructor(
    readonly code: AiFailure,
    readonly diagnostic?: ValidationDiagnostic,
  ) {
    super(messages[code]);
  }
}
export function readAiConfig(env: Record<string, string | undefined>) {
  if (env['OPENAI_AI_ENABLED'] !== 'true')
    throw new AiReasoningError('DISABLED');
  const apiKey = env['OPENAI_API_KEY'];
  if (!apiKey) throw new AiReasoningError('MISSING_KEY');
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey))
    throw new AiReasoningError('INVALID_KEY');
  const model = env['OPENAI_MODEL'] ?? 'gpt-4.1-mini';
  if (!(aiModels as readonly string[]).includes(model))
    throw new AiReasoningError('CONFIGURATION');
  return { apiKey, model };
}
export interface AiReceipt {
  inputTokens: number | null;
  outputTokens: number | null;
  responseId: string | null;
}
// Convert our existing runtime schemas to the supported strict JSON Schema subset.
// Semantic restrictions removed here (UUID format / uniqueness) remain enforced by domain validators.
export function strictOutputSchema(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AiReasoningError(
      'VALIDATION',
      new AiValidationError('INPUT', 'SCHEMA_CONFIGURATION').diagnostic,
    );
  const source = value as Record<string, unknown>,
    result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(source)) {
    if (['format', 'uniqueItems'].includes(key)) continue;
    if (key === 'const') {
      result['enum'] = [v];
      continue;
    }
    if (key === 'properties')
      result[key] = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([name, schema]) => [
          name,
          strictOutputSchema(schema),
        ]),
      );
    else if (key === 'items') result[key] = strictOutputSchema(v);
    else result[key] = v;
  }
  if (!result['type'] && Array.isArray(result['enum']))
    result['type'] = (result['enum'] as unknown[]).includes(null)
      ? ['string', 'null']
      : 'string';
  return result;
}
export function validateStructuredOutput(
  value: unknown,
  schema: Record<string, unknown>,
  depth = 0,
): boolean {
  if (depth > 12) return false;
  const kind =
    value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const types = Array.isArray(schema['type'])
    ? schema['type']
    : [schema['type']];
  if (schema['type'] && !types.includes(kind)) return false;
  if (Array.isArray(schema['enum']) && !schema['enum'].includes(value))
    return false;
  if ('const' in schema && schema['const'] !== value) return false;
  if (typeof value === 'string') {
    if (
      (typeof schema['minLength'] === 'number' &&
        value.length < schema['minLength']) ||
      (typeof schema['maxLength'] === 'number' &&
        value.length > schema['maxLength'])
    )
      return false;
    if (
      schema['format'] === 'uuid' &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value,
      )
    )
      return false;
  }
  if (Array.isArray(value)) {
    if (
      value.length > 100 ||
      (typeof schema['minItems'] === 'number' &&
        value.length < schema['minItems']) ||
      (typeof schema['maxItems'] === 'number' &&
        value.length > schema['maxItems'])
    )
      return false;
    if (
      schema['uniqueItems'] &&
      new Set(value.map((v) => JSON.stringify(v))).size !== value.length
    )
      return false;
    return value.every((v) =>
      validateStructuredOutput(
        v,
        schema['items'] as Record<string, unknown>,
        depth + 1,
      ),
    );
  }
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>,
      properties = schema['properties'] as Record<
        string,
        Record<string, unknown>
      >;
    if (
      !properties ||
      (Array.isArray(schema['required']) &&
        schema['required'].some((k) => !(String(k) in object)))
    )
      return false;
    if (
      schema['additionalProperties'] === false &&
      Object.keys(object).some((k) => !(k in properties))
    )
      return false;
    return Object.entries(object).every(
      ([k, v]) =>
        properties[k] !== undefined &&
        validateStructuredOutput(v, properties[k], depth + 1),
    );
  }
  return true;
}
// Only explicit connection establishment/DNS errors prove no request was sent.
// Socket resets, timeouts, aggregates and unknown failures remain uncertain.
function definitelyPreSend(error: unknown): boolean {
  if (!error || typeof error !== 'object' || 'errors' in error) return false;
  const cause = error as { code?: unknown; cause?: unknown };
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(String(cause.code)))
    return true;
  const nested = cause.cause;
  return (
    !!nested &&
    typeof nested === 'object' &&
    !('errors' in nested) &&
    ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(
      String((nested as { code?: unknown }).code),
    )
  );
}
export class OpenAiReasoningProvider
  implements TestPlanningProvider, CuriosityProvider
{
  readonly providerId = 'openai';
  readonly modelId: string;
  receipt: AiReceipt = {
    inputTokens: null,
    outputTokens: null,
    responseId: null,
  };
  private readonly client: Pick<OpenAI, 'responses'>;
  constructor(
    private readonly config: ReturnType<typeof readAiConfig>,
    client?: Pick<OpenAI, 'responses'>,
  ) {
    if ('window' in globalThis) throw new AiReasoningError('CONFIGURATION');
    this.modelId = config.model;
    this.client =
      client ??
      new OpenAI({
        apiKey: config.apiKey,
        baseURL: 'https://api.openai.com/v1',
        maxRetries: 0,
        timeout: aiLimits.timeoutMs,
        logLevel: 'off',
        fetchOptions: { redirect: 'error' },
      });
  }
  plan(request: PlanningAiRequest, signal: AbortSignal) {
    return this.reason(
      request.instructions,
      request.data,
      request.outputSchema,
      signal,
    );
  }
  propose(
    request: ReturnType<typeof curiosityProviderInput>,
    signal: AbortSignal,
  ) {
    return this.reason(
      request.instructions,
      request.context,
      request.outputSchema,
      signal,
    );
  }
  private async reason(
    instructions: string,
    data: unknown,
    schema: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    const outputSchema = strictOutputSchema(schema);
    if (
      JSON.stringify({ instructions, data, schema: outputSchema }).includes(
        this.config.apiKey,
      )
    )
      throw new AiReasoningError(
        'VALIDATION',
        new AiValidationError('INPUT', 'CREDENTIAL_IN_CONTEXT').diagnostic,
      );
    if (
      Buffer.byteLength(
        JSON.stringify({ instructions, data, schema: outputSchema }),
        'utf8',
      ) +
        500 >
      aiLimits.inputTokens
    )
      throw new AiReasoningError(
        'VALIDATION',
        new AiValidationError('INPUT', 'INPUT_SIZE_LIMIT').diagnostic,
      );
    if (signal.aborted) throw new AiReasoningError('CANCELLED');
    const deadline = AbortSignal.timeout(aiLimits.timeoutMs),
      combined = AbortSignal.any([signal, deadline]);
    try {
      const response = await this.client.responses.create(
        {
          model: this.config.model,
          store: false,
          tools: [],
          max_output_tokens: aiLimits.outputTokens,
          truncation: 'disabled',
          instructions,
          input: [{ role: 'user', content: JSON.stringify(data) }],
          text: {
            format: {
              type: 'json_schema',
              name: 'testpilot_proposals',
              strict: true,
              schema: outputSchema,
            },
          },
        },
        { signal: combined },
      );
      this.receipt = {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        responseId: /^resp_[A-Za-z0-9_-]{1,190}$/.test(response.id)
          ? response.id
          : null,
      };
      if (combined.aborted)
        throw new AiReasoningError(signal.aborted ? 'CANCELLED' : 'TIMEOUT');
      if (response.status !== 'completed')
        throw new AiReasoningError('TRUNCATED');
      if (
        response.output.some(
          (item) =>
            item.type === 'message' &&
            item.content.some((c) => c.type === 'refusal'),
        )
      )
        throw new AiReasoningError('REFUSAL');
      if (!response.output_text || response.output_text.length > 64000)
        throw new AiReasoningError(
          'VALIDATION',
          new AiValidationError('PARSE', 'OUTPUT_MISSING_OR_OVERSIZED')
            .diagnostic,
        );
      try {
        const raw = JSON.parse(response.output_text) as unknown;
        if (!validateStructuredOutput(raw, schema as Record<string, unknown>))
          throw new AiReasoningError(
            'VALIDATION',
            new AiValidationError('SCHEMA', 'OUTPUT_SCHEMA_MISMATCH')
              .diagnostic,
          );
        return raw;
      } catch (error) {
        if (error instanceof AiReasoningError) throw error;
        throw new AiReasoningError(
          'VALIDATION',
          new AiValidationError('PARSE', 'OUTPUT_INVALID_JSON').diagnostic,
        );
      }
    } catch (error) {
      if (error instanceof AiReasoningError) throw error;
      if (combined.aborted)
        throw new AiReasoningError(signal.aborted ? 'CANCELLED' : 'TIMEOUT');
      if (error instanceof OpenAI.APIConnectionTimeoutError)
        throw new AiReasoningError('TIMEOUT');
      if (error instanceof OpenAI.APIConnectionError)
        throw new AiReasoningError(
          definitelyPreSend(error.cause) ? 'PRE_SEND' : 'NETWORK',
        );
      if (error instanceof OpenAI.APIError) {
        if (error.status === 401 || error.status === 403)
          throw new AiReasoningError('INVALID_KEY');
        if (error.status === 429)
          throw new AiReasoningError(
            error.code === 'insufficient_quota' ? 'CREDITS' : 'RATE_LIMIT',
          );
        throw new AiReasoningError(
          error.status !== undefined &&
            error.status >= 500 &&
            error.status <= 599
            ? 'PROVIDER_TRANSIENT'
            : 'PROVIDER',
        );
      }
      throw new AiReasoningError('NETWORK');
    }
  }
}
