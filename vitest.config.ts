import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
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
