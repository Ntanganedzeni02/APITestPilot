import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tooling/**/*.test.ts',
      'tests/**/*.{test,spec}.ts',
      'apps/*/{src,tests}/**/*.{test,spec}.ts',
      'workers/*/{src,tests}/**/*.{test,spec}.ts',
      'packages/*/{src,tests}/**/*.{test,spec}.ts',
    ],
    clearMocks: true,
    restoreMocks: true,
  },
});
