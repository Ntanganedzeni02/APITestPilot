import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./tooling/server-only-fixture.ts', import.meta.url),
      ),
      '@testpilot/ai/server': fileURLToPath(
        new URL('./packages/ai/src/server.ts', import.meta.url),
      ),
      '@testpilot/safety': fileURLToPath(
        new URL('./packages/safety/src/index.ts', import.meta.url),
      ),
      '@testpilot/evidence': fileURLToPath(
        new URL('./packages/evidence/src/index.ts', import.meta.url),
      ),
      '@testpilot/api-runner': fileURLToPath(
        new URL('./workers/api-runner/src/index.ts', import.meta.url),
      ),
      '@testpilot/test-engine': fileURLToPath(
        new URL('./packages/test-engine/src/index.ts', import.meta.url),
      ),
      '@testpilot/qa-intelligence': fileURLToPath(
        new URL('./packages/qa-intelligence/src/index.ts', import.meta.url),
      ),
      '@testpilot/ai': fileURLToPath(
        new URL('./packages/ai/src/index.ts', import.meta.url),
      ),
      '@testpilot/behaviour-graph': fileURLToPath(
        new URL('./packages/behaviour-graph/src/index.ts', import.meta.url),
      ),
      '@testpilot/api-spec': fileURLToPath(
        new URL('./packages/api-spec/src/index.ts', import.meta.url),
      ),
      '@testpilot/domain': fileURLToPath(
        new URL('./packages/domain/src/index.ts', import.meta.url),
      ),
      '@testpilot/database': fileURLToPath(
        new URL('./packages/database/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: [
      'tooling/**/*.test.ts',
      'tests/**/*.{test,spec}.ts',
      'apps/*/{src,tests}/**/*.{test,spec}.{ts,tsx}',
      'workers/*/{src,tests}/**/*.{test,spec}.ts',
      'packages/*/{src,tests}/**/*.{test,spec}.ts',
    ],
    clearMocks: true,
    restoreMocks: true,
  },
});
