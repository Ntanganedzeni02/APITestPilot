// Operator attestation, not a worker health probe. Keep false until runner acceptance.
export const executionUnavailableMessage =
  'API execution is unavailable in this beta until the dedicated runner is configured and verified. Planning, review and existing evidence remain available.';

export function executionAvailable(
  env: Record<string, string | undefined> = process.env,
) {
  return env['EXECUTION_RUNNER_READY'] === 'true';
}
