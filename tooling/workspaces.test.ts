// Repository architecture checks only; no TestPilot product behavior.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

interface Manifest {
  name: string;
  private: boolean;
  type: string;
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const expected = [
  'domain',
  'database',
  'api-spec',
  'behaviour-graph',
  'test-engine',
  'safety',
  'ai',
  'evidence',
  'shared',
  'api-runner',
];

function discoverWorkspaces() {
  return ['apps', 'workers', 'packages'].flatMap((area) =>
    readdirSync(area, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(area, entry.name))
      .filter((path) => existsSync(join(path, 'package.json')))
      .map((path) => ({
        path,
        manifest: JSON.parse(
          readFileSync(join(path, 'package.json'), 'utf8'),
        ) as Manifest,
      })),
  );
}

function dependencies(manifest: Manifest) {
  return {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  };
}

describe('workspace boundaries', () => {
  it('establishes every expected named TypeScript boundary with consistent scripts', () => {
    const workspaces = discoverWorkspaces();
    const names = workspaces.map(({ manifest }) => manifest.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of expected) {
      const workspace = workspaces.find(
        ({ manifest }) => manifest.name === `@testpilot/${name}`,
      );
      expect(workspace, name).toBeDefined();
      if (!workspace) throw new Error(`Missing workspace: ${name}`);
      expect(workspace.manifest).toMatchObject({
        private: true,
        type: 'module',
      });
      expect(workspace.manifest.scripts).toMatchObject({
        build: 'tsc -p tsconfig.json',
        typecheck: 'tsc -p tsconfig.json --noEmit',
        lint: 'eslint . --max-warnings 0',
      });
      expect(existsSync(join(workspace.path, 'src/index.ts'))).toBe(true);
      const config: unknown = JSON.parse(
        readFileSync(join(workspace.path, 'tsconfig.json'), 'utf8'),
      );
      expect(config).toMatchObject({
        extends: '../../tsconfig.base.json',
        compilerOptions: { rootDir: 'src', outDir: 'dist', declaration: true },
      });
    }
  });

  it('keeps domain free of declared external dependencies', () => {
    const domain = discoverWorkspaces().find(
      ({ manifest }) => manifest.name === '@testpilot/domain',
    );
    expect(domain).toBeDefined();
    if (!domain) throw new Error('Missing domain workspace');
    expect(dependencies(domain.manifest)).toEqual({});
  });

  it('has no circular workspace dependencies', () => {
    const manifests = new Map(
      discoverWorkspaces().map(({ manifest }) => [manifest.name, manifest]),
    );
    const active = new Set<string>();
    const visited = new Set<string>();
    function visit(name: string) {
      if (active.has(name)) throw new Error(`Workspace cycle at ${name}`);
      if (visited.has(name)) return;
      const manifest = manifests.get(name);
      if (!manifest) return;
      active.add(name);
      for (const dependency of Object.keys(dependencies(manifest))) {
        if (manifests.has(dependency)) visit(dependency);
      }
      active.delete(name);
      visited.add(name);
    }
    expect(() => [...manifests.keys()].forEach(visit)).not.toThrow();
  });

  it('enforces the domain import boundary through the actual ESLint config', async () => {
    const eslint = new ESLint();
    for (const target of [
      'react',
      'next',
      '@supabase/supabase-js',
      'redis',
      'bullmq',
      'openai',
      'node:http',
    ]) {
      const results = await eslint.lintText(
        `export { value } from '${target}';`,
        { filePath: 'packages/domain/src/boundary-fixture.ts' },
      );
      expect(
        results[0]?.messages.some(
          (message) => message.ruleId === 'no-restricted-imports',
        ),
        target,
      ).toBe(true);
    }
    const relative = await eslint.lintText(
      "export { value } from './value.js';",
      { filePath: 'packages/domain/src/boundary-fixture.ts' },
    );
    expect(relative[0]?.errorCount).toBe(0);
  });

  it('retains the engineering documentation', () => {
    for (const path of [
      'AGENTS.md',
      'README.md',
      'docs/architecture/overview.md',
      'docs/architecture/data-model.md',
      'docs/architecture/ai-architecture.md',
      'docs/architecture/execution-engine.md',
      'docs/architecture/security.md',
      'docs/development/setup.md',
      'docs/development/testing.md',
      'docs/development/conventions.md',
      'docs/adr/0001-monorepo-architecture.md',
    ]) {
      expect(existsSync(path), path).toBe(true);
    }
  });
});
