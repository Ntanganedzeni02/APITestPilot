import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('web root environment loading (isolated configuration fixtures)', () => {
  it.each([false, true])(
    'loads optional root configuration; file present: %s',
    (present) => {
      const root = mkdtempSync(join(tmpdir(), 'testpilot-env-'));
      try {
        const app = join(root, 'apps', 'web');
        mkdirSync(app, { recursive: true });
        const config = join(app, 'next.config.ts');
        writeFileSync(config, readFileSync('apps/web/next.config.ts'));
        if (present)
          writeFileSync(
            join(root, '.env.local'),
            'TP_ENV_FIXTURE="root fixture"\nAPP_ORIGIN=http://127.0.0.1:3000\n',
          );
        const output = execFileSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `delete process.env.TP_ENV_FIXTURE; await import(${JSON.stringify(pathToFileURL(config).href)}); console.log(JSON.stringify({fixture:process.env.TP_ENV_FIXTURE??null,origin:process.env.APP_ORIGIN}));`,
          ],
          {
            cwd: app,
            env: { ...process.env, APP_ORIGIN: 'https://deployment.example' },
            encoding: 'utf8',
          },
        );
        expect(JSON.parse(output)).toEqual({
          fixture: present ? 'root fixture' : null,
          origin: 'https://deployment.example',
        });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
