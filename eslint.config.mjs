import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.tools/**',
    '**/.pnpm-store/**',
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/.next/**',
    '**/coverage/**',
    '**/next-env.d.ts',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    settings: {
      next: { rootDir: fileURLToPath(new URL('./apps/web/', import.meta.url)) },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    files: ['packages/domain/src/**/*.{ts,mts,cts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.{1,2}/)',
              message:
                'Domain imports must be relative and infrastructure-independent. External dependencies require architectural review.',
            },
          ],
        },
      ],
    },
  },
]);
