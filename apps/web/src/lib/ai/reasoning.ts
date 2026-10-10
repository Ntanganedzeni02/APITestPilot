import { AiValidationError } from '@testpilot/ai';
import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AiReasoningError,
  OpenAiReasoningProvider,
  readAiConfig,
  aiLimits,
} from '@testpilot/ai/server';
import { validateId } from '@testpilot/domain';
export async function runAiReasoning(
  client: SupabaseClient,
  scope: {
    projectId: string;
    sourceId: string;
    workflow: 'PLANNING' | 'INVESTIGATION';
    anchorId: string;
  },
  context: unknown,
  build: (
    provider: OpenAiReasoningProvider,
    signal: AbortSignal,
  ) => Promise<unknown>,
  signal: AbortSignal = new AbortController().signal,
) {
  const config = readAiConfig(process.env);
  if (signal.aborted) throw new AiReasoningError('CANCELLED');
  const serialized = JSON.stringify(context);
  if (Buffer.byteLength(serialized, 'utf8') > 8000)
    throw new AiReasoningError(
      'VALIDATION',
      new AiValidationError('INPUT', 'CONTEXT_SIZE_LIMIT').diagnostic,
    );
  const { data, error } = await client.rpc('admit_ai_reasoning', {
    project_input: validateId(scope.projectId),
    source_input: validateId(scope.sourceId),
    workflow_input: scope.workflow,
    anchor_input: validateId(scope.anchorId),
    model_input: config.model,
    hash_input: createHash('sha256').update(serialized).digest('hex'),
  });
  if (error)
    throw new AiReasoningError(
      error.code === '23505' ? 'DUPLICATE' : 'ADMISSION',
    );
  if (
    !data ||
    typeof data !== 'object' ||
    !data.id ||
    !data.nonce ||
    !Number.isFinite(Date.parse(data.createdAt)) ||
    Date.now() - Date.parse(data.createdAt) > 30000
  )
    throw new AiReasoningError('ADMISSION');
  const id = validateId(data.id),
    nonce = validateId(data.nonce);
  const provider = new OpenAiReasoningProvider(config);
  const receipt = () => {
    const r = provider.receipt;
    const known =
      Number.isSafeInteger(r.inputTokens) &&
      r.inputTokens !== null &&
      r.inputTokens >= 0 &&
      r.inputTokens <= aiLimits.inputTokens &&
      Number.isSafeInteger(r.outputTokens) &&
      r.outputTokens !== null &&
      r.outputTokens >= 0 &&
      r.outputTokens <= aiLimits.outputTokens;
    return {
      inputTokens: known ? r.inputTokens : null,
      outputTokens: known ? r.outputTokens : null,
      responseId: r.responseId,
      errorCode: null as string | null,
    };
  };
  let payload: unknown;
  try {
    payload = await build(provider, signal);
    if (signal.aborted) throw new AiReasoningError('CANCELLED');
    if (
      provider.receipt.inputTokens !== null &&
      (provider.receipt.inputTokens > aiLimits.inputTokens ||
        provider.receipt.outputTokens === null ||
        provider.receipt.outputTokens > aiLimits.outputTokens)
    )
      throw new AiReasoningError('USAGE_UNCERTAIN');
  } catch (error) {
    const failure =
      error instanceof AiReasoningError
        ? error
        : new AiReasoningError(
            'VALIDATION',
            error instanceof AiValidationError
              ? error.diagnostic
              : new AiValidationError('PLAN', 'UNCLASSIFIED_BUILD_FAILURE')
                  .diagnostic,
          );
    if (failure.code === 'VALIDATION') {
      const diagnostic =
        failure.diagnostic ??
        new AiValidationError('PLAN', 'UNCLASSIFIED_VALIDATION_FAILURE')
          .diagnostic;
      console.warn('AI_VALIDATION_REJECTED', { attemptId: id, ...diagnostic });
    }
    const usage = receipt();
    usage.errorCode = failure.code;
    const saved = await client.rpc('complete_ai_reasoning', {
      request_input: id,
      nonce_input: nonce,
      state_input: [
        'USAGE_UNCERTAIN',
        'NETWORK',
        'TIMEOUT',
        'CANCELLED',
      ].includes(failure.code)
        ? 'UNCERTAIN'
        : 'FAILED',
      usage_input: usage,
      payload_input: null,
    });
    if (saved.error) {
      console.warn('AI_PERSISTENCE_REJECTED', {
        attemptId: id,
        stage: 'PERSISTENCE',
        code: 'USAGE_UNCERTAIN',
        rule: 'FAILURE_RECONCILIATION_REJECTED',
      });
      throw new AiReasoningError('USAGE_UNCERTAIN');
    }
    throw failure;
  }
  const saved = await client.rpc('complete_ai_reasoning', {
    request_input: id,
    nonce_input: nonce,
    state_input: 'COMPLETED',
    usage_input: receipt(),
    payload_input: payload,
  });
  if (saved.error) {
    console.warn('AI_PERSISTENCE_REJECTED', {
      attemptId: id,
      stage: 'PERSISTENCE',
      code: 'USAGE_UNCERTAIN',
      rule: 'RESULT_RECONCILIATION_REJECTED',
    });
    throw new AiReasoningError('USAGE_UNCERTAIN');
  }
  return validateId(saved.data);
}
