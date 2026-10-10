import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { productRoutes } from '../../lib/navigation';
import { Navigation } from '../navigation/navigation';
import { Overview } from './overview';
import { ProductPage } from './product-page';

describe('truthful page presentation', () => {
  it('renders every product area with its purpose and honest empty state', () => {
    for (const route of productRoutes.filter((entry) => entry.href !== '/')) {
      const html = renderToStaticMarkup(<ProductPage route={route} />);
      expect(html).toContain(route.emptyTitle);
      expect(html).toContain(route.description);
      expect(html).toContain('<h1');
      expect(html).not.toMatch(/<table|<meter|<progress/);
    }
  });

  it('does not equate the absence of findings with a clean API', () => {
    const findings = productRoutes.find((route) => route.href === '/findings');
    if (!findings) throw new Error('Missing findings route');
    expect(renderToStaticMarkup(<ProductPage route={findings} />)).toContain(
      'This empty view does not mean an API is defect-free.',
    );
  });

  it('offers real project setup and explains when quality views appear', () => {
    const html = renderToStaticMarkup(<Overview />);
    expect(html).toContain('href="/projects/new"');
    expect(html).toContain('Create a real project');
    expect(html).toContain('What will appear here');
    expect(html).toContain('No results are shown until there is real evidence');
  });

  it('offers real API Map navigation without inventing results', () => {
    const html = renderToStaticMarkup(
      <Overview projectName="Payments &lt;test&gt;" />,
    );
    expect(html).toContain('Your project:');
    expect(html).toContain('href="/api-map"');
    expect(html).toContain('Open API Map');
    expect(html).not.toMatch(/<table|<meter|<progress/);
  });

  it('exposes one current navigation item through aria-current', () => {
    const html = renderToStaticMarkup(<Navigation pathname="/risks" />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(
      /<a[^>]*(?:href="\/risks"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/risks")/,
    );
    expect(html).toContain('aria-label="Main navigation"');
  });
});
