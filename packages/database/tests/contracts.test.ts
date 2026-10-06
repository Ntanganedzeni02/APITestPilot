import { describe, expect, it } from 'vitest';
import { decodeProject, decodeEnvironment } from '../src/index.js';
const id = '10000000-0000-0000-0000-000000000001';
const timestamps = {
  created_at: '2026-10-06T00:00:00Z',
  updated_at: '2026-10-06T00:00:00Z',
};
describe('untrusted persistence responses', () => {
  it('accepts supported project/environment contracts and rejects malformed rows', () => {
    expect(
      decodeProject({
        id,
        workspace_id: id,
        created_by: id,
        name: 'Payments',
        ...timestamps,
      }).name,
    ).toBe('Payments');
    expect(
      decodeEnvironment({ id, project_id: id, type: 'STAGING', ...timestamps })
        .type,
    ).toBe('STAGING');
    for (const value of [
      null,
      [],
      {},
      { id, project_id: id, type: 'CUSTOM', ...timestamps },
      { id: 'bad', project_id: id, type: 'STAGING', ...timestamps },
    ])
      expect(() => decodeEnvironment(value)).toThrow();
    expect(() =>
      decodeProject({ id, workspace_id: id, created_by: id, name: 'Payments' }),
    ).toThrow();
  });
});
