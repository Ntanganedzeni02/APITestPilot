import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../../../lib/tenancy/context', () => ({
  getTenantContext: async () => ({
    workspace: { name: 'Authorized fixture workspace' },
    project: { name: 'Authorized fixture project' },
  }),
}));
import Ask from './page';
it('assistant preview is scoped by existing context, explicitly disabled, and offers only real navigation', async () => {
  const html = renderToStaticMarkup(await Ask());
  expect(html).toContain('Authorized fixture project');
  expect(html).toContain('nothing you type is submitted');
  expect(html).toContain('No conversation backend is connected');
  expect(html).toContain('Send unavailable');
  expect(html).toMatch(/<textarea[^>]*disabled/);
  expect(html).not.toContain('<form');
  expect(html).not.toContain('name="analysisId"');
  for (const href of ['/api-map', '/risks', '/tests', '/findings'])
    expect(html).toContain(`href="${href}"`);
});
