import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { parseApiSpec } from '@testpilot/api-spec';
import type { ApiImportSummary } from '@testpilot/domain';
import { buildGraphForImport } from './build';
const ws = '14000000-0000-0000-0000-000000000001',
  project = '14000000-0000-0000-0000-000000000002',
  id = '14000000-0000-0000-0000-000000000003';
const source: ApiImportSummary = {
  id,
  workspaceId: ws,
  projectId: project,
  createdAt: '2026-10-06T00:00:00Z',
  createdBy: id,
  knowledge: parseApiSpec(
    readFileSync('packages/behaviour-graph/tests/fixtures/users.json', 'utf8'),
    'json',
  ).knowledge,
};
it('builds the persisted import and creates a new snapshot on each request', async () => {
  const imports = { list: vi.fn().mockResolvedValue([source]), save: vi.fn() };
  const graphs = {
    list: vi.fn(),
    save: vi.fn().mockResolvedValueOnce(ws).mockResolvedValueOnce(project),
  };
  expect(await buildGraphForImport(imports, graphs, ws, project, id)).toBe(ws);
  expect(await buildGraphForImport(imports, graphs, ws, project, id)).toBe(
    project,
  );
  expect(graphs.save.mock.calls[0]).toEqual(graphs.save.mock.calls[1]);
});
it('rejects inaccessible import before graph persistence', async () => {
  const graphs = { list: vi.fn(), save: vi.fn() };
  await expect(
    buildGraphForImport(
      { list: vi.fn().mockResolvedValue([]), save: vi.fn() },
      graphs,
      ws,
      project,
      id,
    ),
  ).rejects.toThrow('available API import');
  expect(graphs.save).not.toHaveBeenCalled();
});
it('propagates persistence failure rather than inventing a saved graph', async () => {
  await expect(
    buildGraphForImport(
      { list: vi.fn().mockResolvedValue([source]), save: vi.fn() },
      {
        list: vi.fn(),
        save: vi.fn().mockRejectedValue(new Error('Persistence failed')),
      },
      ws,
      project,
      id,
    ),
  ).rejects.toThrow('Persistence failed');
});
