import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  tenant: vi.fn(),
  request: vi.fn(),
  approve: vi.fn(),
  cancel: vi.fn(),
  list: vi.fn(),
}));
vi.mock('../auth/server', () => ({
  requireUser: async () => ({ client: {} }),
}));
vi.mock('../tenancy/context', () => ({ getTenantContext: m.tenant }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@testpilot/database', async (original) => ({
  ...(await original<typeof import('@testpilot/database')>()),
  createExecutionRepository: () => ({
    request: m.request,
    approve: m.approve,
    cancel: m.cancel,
    list: m.list,
  }),
  createTenantService: vi.fn(),
}));
import { executionAction } from './actions';
import { ExecutionPersistenceError } from '@testpilot/database';
import {
  executionAvailable,
  executionUnavailableMessage,
} from './availability';
const id = '11111111-1111-4111-8111-111111111111';
function form(mode: string) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    mode,
    caseId: id,
    environmentId: id,
    runId: id,
    fingerprint: 'a'.repeat(64),
    EXECUTION_RUNNER_READY: 'true',
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.request.mockReset();
  vi.stubEnv('EXECUTION_RUNNER_READY', 'false');
  m.tenant.mockResolvedValue({ workspace: { id }, project: { id } });
  m.list.mockResolvedValue([{ id }]);
});
afterEach(() => vi.unstubAllEnvs());
it('defaults closed and requires exact operator attestation', () => {
  for (const value of [undefined, '', 'false', 'TRUE'])
    expect(executionAvailable({ EXECUTION_RUNNER_READY: value })).toBe(false);
  expect(executionAvailable({ EXECUTION_RUNNER_READY: 'true' })).toBe(true);
});
it.each(['REQUEST', 'APPROVE'])(
  'blocks %s before persistence even with forged form readiness',
  async (mode) => {
    expect(await executionAction({}, form(mode))).toEqual({
      error: executionUnavailableMessage,
      errorCode: 'EXECUTION_UNAVAILABLE',
    });
    expect(m.request).not.toHaveBeenCalled();
    expect(m.approve).not.toHaveBeenCalled();
  },
);
it.each([
  'ACCESS',
  'ELIGIBILITY',
  'CONFIGURATION',
  'SCHEMA',
  'CONFLICT',
  'DATABASE',
] as const)(
  'distinguishes safe %s feedback without exposing database details',
  async (reason) => {
    vi.stubEnv('EXECUTION_RUNNER_READY', 'true');
    m.request.mockRejectedValue(new ExecutionPersistenceError(reason));
    const result = await executionAction({}, form('REQUEST'));
    expect(result.errorCode).toBe(reason);
    expect(result.saved).toBeUndefined();
    expect(result.error).not.toContain('Unable to save execution request.');
  },
);
it('preserves normal request admission when explicitly enabled', async () => {
  vi.stubEnv('EXECUTION_RUNNER_READY', 'true');
  expect(await executionAction({}, form('REQUEST'))).toEqual({ saved: true });
  expect(m.request).toHaveBeenCalledWith(id, id);
});
it('retains cancellation while execution is unavailable', async () => {
  expect(await executionAction({}, form('CANCEL'))).toEqual({ saved: true });
  expect(m.cancel).toHaveBeenCalledWith(id);
});
it('still requires an authorized project context', async () => {
  vi.stubEnv('EXECUTION_RUNNER_READY', 'true');
  m.tenant.mockResolvedValue({ workspace: null, project: null });
  expect(await executionAction({}, form('REQUEST'))).toEqual({
    error: 'Select a project first.',
  });
  expect(m.request).not.toHaveBeenCalled();
});
