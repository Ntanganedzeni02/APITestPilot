import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { importSpecification } from './import';
import { MAX_SPEC_BYTES } from '@testpilot/api-spec';
const source = readFileSync(
  'packages/api-spec/tests/fixtures/catalog.json',
  'utf8',
);
const workspace = '10000000-0000-0000-0000-000000000001';
const project = '20000000-0000-0000-0000-000000000001';
describe('import application orchestration (persistence fixtures)', () => {
  it.each(['paste', 'file'])('validates and saves %s once', async (mode) => {
    const form = new FormData();
    form.set('mode', mode);
    if (mode === 'paste') {
      form.set('format', 'json');
      form.set('source', source);
    } else
      form.set(
        'file',
        new File([source], 'catalog.json', { type: 'text/plain' }),
      );
    const save = vi.fn().mockResolvedValue(project);
    expect(
      await importSpecification(
        { save, list: vi.fn() },
        workspace,
        project,
        form,
      ),
    ).toBe(project);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(
      workspace,
      project,
      expect.objectContaining({
        knowledge: expect.objectContaining({
          title: 'Catalog development fixture',
        }),
      }),
    );
  });
  it('rejects oversized files, bad extensions and malformed input before saving', async () => {
    for (const file of [
      new File(['bad'], 'bad.html'),
      new File(['bad'], 'bad.json'),
      new File([' '.repeat(MAX_SPEC_BYTES + 1)], 'big.json'),
    ]) {
      const form = new FormData();
      form.set('mode', 'file');
      form.set('file', file);
      const save = vi.fn();
      await expect(
        importSpecification({ save, list: vi.fn() }, workspace, project, form),
      ).rejects.toThrow();
      expect(save).not.toHaveBeenCalled();
    }
  });
  it('does not report success or retry a failed atomic persistence call', async () => {
    const form = new FormData();
    form.set('mode', 'paste');
    form.set('format', 'json');
    form.set('source', source);
    const save = vi
      .fn()
      .mockRejectedValue(new Error('database fixture failure'));
    await expect(
      importSpecification({ save, list: vi.fn() }, workspace, project, form),
    ).rejects.toThrow('fixture failure');
    expect(save).toHaveBeenCalledOnce();
  });
});
