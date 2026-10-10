// Engineering configuration checks only; no TestPilot product behavior.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('engineering foundation', () => {
  it('enforces the shared strict compiler contract', () => {
    const result = ts.readConfigFile('tsconfig.base.json', ts.sys.readFile);
    expect(result.error).toBeUndefined();
    const config = ts.parseJsonConfigFileContent(result.config, ts.sys, '.');
    expect(config.options.strict).toBe(true);
    expect(config.options.noUncheckedIndexedAccess).toBe(true);
    expect(config.options.exactOptionalPropertyTypes).toBe(true);
    expect(config.options.types).toEqual([]);
  });

  it('rejects unchecked indexed access in a tooling-only fixture', () => {
    const filename = '/tooling-fixture.ts';
    const source = 'const items: string[] = []; const item: string = items[0];';
    const config = ts.readConfigFile('tsconfig.base.json', ts.sys.readFile);
    const options = {
      ...ts.parseJsonConfigFileContent(config.config, ts.sys, '.').options,
      noEmit: true,
    };
    const host = ts.createCompilerHost(options);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (path, languageVersion, onError, shouldCreate) =>
      path === filename
        ? ts.createSourceFile(path, source, languageVersion, true)
        : originalGetSourceFile(path, languageVersion, onError, shouldCreate);
    const program = ts.createProgram([filename], options, host);
    expect(
      program
        .getSemanticDiagnostics()
        .some(
          (error) => error.file?.fileName === filename && error.code === 2322,
        ),
    ).toBe(true);
  });

  it('keeps the root private and discovers all architectural workspace areas', () => {
    const root: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(root).toMatchObject({ private: true });
    const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
    for (const pattern of ['apps/*', 'workers/*', 'packages/*']) {
      expect(workspace).toContain(pattern);
    }
  });
});
