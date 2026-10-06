import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseApiSpec } from '@testpilot/api-spec';
import { KnowledgeView } from './knowledge-view';
describe('API Map persisted knowledge presentation (specification fixture)', () => {
  it('shows normalized operations and escapes untrusted descriptions', () => {
    const source = JSON.parse(
      readFileSync('packages/api-spec/tests/fixtures/catalog.json', 'utf8'),
    );
    source.info.description = '<script>alert("fixture")</script>';
    const knowledge = parseApiSpec(JSON.stringify(source), 'json').knowledge;
    const html = renderToStaticMarkup(<KnowledgeView knowledge={knowledge} />);
    expect(html).toContain('/items/{id}');
    expect(html).toContain('Parameters');
    expect(html).toContain('Responses / media types');
    expect(html).toContain('Effective security requirements');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('must-not-be-stored');
    expect(html).toContain('operations');
  });
});
